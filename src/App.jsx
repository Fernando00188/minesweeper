import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";

/** =========================
 *  Config
 *  ========================= */
const DIFFICULTIES = {
  Beginner:    { rows: 9,  cols: 9,  mines: 10 },
  Intermediate:{ rows: 16, cols: 16, mines: 40 },
  Expert:      { rows: 16, cols: 30, mines: 99 },
};

const CELL_SIZE = 24; // px — classic feel

/** =========================
 *  Helpers
 *  ========================= */
function inBounds(r, c, rows, cols) {
  return r >= 0 && r < rows && c >= 0 && c < cols;
}
function neighbors(r, c) {
  return [
    [r-1,c-1],[r-1,c],[r-1,c+1],
    [r,  c-1],        [r,  c+1],
    [r+1,c-1],[r+1,c],[r+1,c+1],
  ];
}
function makeEmptyBoard(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      count: 0,
    }))
  );
}
function plantMines(board, rows, cols, mines, safeR, safeC) {
  const forbidden = new Set([`${safeR},${safeC}`]);
  for (const [nr, nc] of neighbors(safeR, safeC)) {
    if (inBounds(nr, nc, rows, cols)) forbidden.add(`${nr},${nc}`);
  }
  let planted = 0;
  while (planted < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    const key = `${r},${c}`;
    if (!forbidden.has(key) && !board[r][c].isMine) {
      board[r][c].isMine = true;
      planted++;
    }
  }
  // counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) continue;
      let cnt = 0;
      for (const [nr, nc] of neighbors(r, c)) {
        if (inBounds(nr, nc, rows, cols) && board[nr][nc].isMine) cnt++;
      }
      board[r][c].count = cnt;
    }
  }
}
function cloneBoard(board) {
  return board.map(row => row.map(cell => ({ ...cell })));
}
function floodReveal(board, startR, startC) {
  const rows = board.length;
  const cols = board[0].length;
  const q = [[startR, startC]];
  const seen = new Set([`${startR},${startC}`]);

  while (q.length) {
    const [r, c] = q.shift();
    board[r][c].isRevealed = true;

    if (board[r][c].count === 0) {
      for (const [nr, nc] of neighbors(r, c)) {
        if (!inBounds(nr, nc, rows, cols)) continue;
        const key = `${nr},${nc}`;
        const cell = board[nr][nc];
        if (!seen.has(key) && !cell.isRevealed && !cell.isFlagged && !cell.isMine) {
          seen.add(key);
          if (cell.count === 0) q.push([nr, nc]);
          cell.isRevealed = true;
        }
      }
    }
  }
}

/** number colors like the classic */
const NUM_COLOR = {
  1: "#0000FF", 2: "#008200", 3: "#FF0000", 4: "#000084",
  5: "#840000", 6: "#008284", 7: "#000000", 8: "#7d7d7d",
};

/** =========================
 *  App
 *  ========================= */
export default function App() {
  const [difficulty, setDifficulty] = useState("Beginner");
  const { rows, cols, mines } = DIFFICULTIES[difficulty];

  const [board, setBoard] = useState(() => makeEmptyBoard(rows, cols));
  const [minesPlanted, setMinesPlanted] = useState(false);
  const [status, setStatus] = useState("ready"); // ready | playing | won | lost
  const [revealedCount, setRevealedCount] = useState(0);

  // ⏱️ Timer state
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  // 🔢 DERIVED: flags left (no separate state; prevents double updates)
  const flagsLeft = useMemo(() => {
    const flagged = board.flat().filter(c => c.isFlagged).length;
    return Math.max(0, mines - flagged);
  }, [board, mines]);

  // Reset board whenever difficulty changes
  useEffect(() => {
    setBoard(makeEmptyBoard(rows, cols));
    setMinesPlanted(false);
    setStatus("ready");
    setRevealedCount(0);
    setSeconds(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [rows, cols, mines]);

  // Start/stop timer based on status
  useEffect(() => {
    if (status === "playing" && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setSeconds(s => Math.min(999, s + 1));
      }, 1000);
    }
    if (status === "won" || status === "lost" || status === "ready") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status]);

  const totalSafe = rows * cols - mines;

  const handleReveal = useCallback((r, c) => {
    setBoard(prev => {
      if (status === "lost" || status === "won") return prev;

      let next = cloneBoard(prev);

      // first click: plant mines + start playing (timer starts via effect)
      if (!minesPlanted) {
        plantMines(next, rows, cols, mines, r, c);
        setMinesPlanted(true);
        setStatus("playing");
        setSeconds(0);
      }

      const cell = next[r][c];
      if (cell.isRevealed || cell.isFlagged) return prev;

      if (cell.isMine) {
        next = next.map(row =>
          row.map(cel => (cel.isMine ? { ...cel, isRevealed: true } : cel))
        );
        setStatus("lost");
        return next;
      }

      if (cell.count === 0) {
        floodReveal(next, r, c);
      } else {
        cell.isRevealed = true;
      }

      const newlyRevealed = next.flat().filter(cel => cel.isRevealed && !cel.isMine).length;
      setRevealedCount(newlyRevealed);

      if (newlyRevealed === totalSafe) {
        next = next.map(row =>
          row.map(cel => (cel.isMine ? { ...cel, isFlagged: true } : cel))
        );
        setStatus("won");
      }
      return next;
    });
  }, [minesPlanted, rows, cols, mines, status, totalSafe]);

  const handleFlag = useCallback((r, c) => {
    setBoard(prev => {
      if (status === "lost" || status === "won") return prev;

      // compute flags left from prev safely
      const flaggedPrev = prev.flat().filter(cell => cell.isFlagged).length;
      const flagsLeftNow = mines - flaggedPrev;

      const next = cloneBoard(prev);
      const cell = next[r][c];
      if (cell.isRevealed) return prev;

      const willFlag = !cell.isFlagged;

      // respect budget
      if (willFlag && flagsLeftNow === 0) return prev;

      cell.isFlagged = willFlag;
      return next;
    });
  }, [status, mines]);

  const reset = () => {
    setBoard(makeEmptyBoard(rows, cols));
    setMinesPlanted(false);
    setStatus("ready");
    setRevealedCount(0);
    setSeconds(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const coveredLeft = rows * cols - revealedCount;

  return (
    <div style={styles.page} onContextMenu={(e) => e.preventDefault()}>
      <h1 style={styles.title}>Minesweeper</h1>

      <div style={styles.topBar}>
        <div style={styles.counterBox}>
          <Counter value={mines} />
        </div>

        <button onClick={reset} style={styles.smiley} title="Reset">
          {status === "won" ? "😎" : status === "lost" ? "😵" : "🙂"}
        </button>

        {/* ▶️ Timer */}
        <div style={styles.counterBox}>
          <Counter value={seconds} />
        </div>
      </div>

      <div style={styles.toolbar}>
        <label style={styles.label}>
          Difficulty:&nbsp;
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            style={styles.select}
          >
            {Object.keys(DIFFICULTIES).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <span style={styles.smallNote}>🚩 Flags left: {flagsLeft}</span>
        <span style={styles.smallNote}>Covered tiles: {coveredLeft}</span>
      </div>

      <div style={styles.boardFrame}>
        <div
          style={{
            ...styles.boardOuter,
            width: cols * CELL_SIZE + 12,
          }}
        >
          <div
            style={{
              ...styles.boardGrid,
              gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)`,
              gridTemplateRows: `repeat(${rows}, ${CELL_SIZE}px)`,
            }}
          >
            {board.map((row, r) =>
              row.map((cell, c) => (
                <Cell
                  key={`${r}-${c}`}
                  cell={cell}
                  onReveal={() => handleReveal(r, c)}
                  onFlag={(e) => {
                    e.preventDefault();
                    handleFlag(r, c);
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <p style={styles.footer}>
        Left-click to reveal • Right-click to flag • First click is always safe
      </p>
    </div>
  );
}

/** =========================
 *  Cell
 *  ========================= */
function Cell({ cell, onReveal, onFlag }) {
  const display = useMemo(() => {
    if (!cell.isRevealed) return cell.isFlagged ? "🚩" : "";
    if (cell.isMine) return "💣";
    return cell.count ? String(cell.count) : "";
  }, [cell]);

  const style = cell.isRevealed
    ? {
        ...styles.cellBase,
        ...styles.cellRevealed,
        color: NUM_COLOR[cell.count] || "#444",
        fontWeight: 700,
      }
    : { ...styles.cellBase, ...styles.cellCovered };

  return (
    <button
      onClick={onReveal}
      onContextMenu={onFlag}
      style={style}
      aria-label="cell"
    >
      {display}
    </button>
  );
}

/** =========================
 *  Counter (fake 7-segment look)
 *  ========================= */
function Counter({ value }) {
  const txt = String(value).padStart(3, "0").slice(-3);
  return (
    <div style={styles.counter}>
      <span>{txt}</span>
    </div>
  );
}

/** =========================
 *  Styles — Classic vibe
 *  ========================= */
const styles = {
  page: {
    minHeight: "100vh",
    background: "#c0c0c0",
    color: "#000",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: 18,
    fontFamily:
      'Tahoma, "Segoe UI", system-ui, -apple-system, Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif',
  },
  title: {
    margin: "2px 0 6px",
    letterSpacing: "0.3px",
    color: "#000",
    textShadow: "0 1px 0 #fff",
  },
  topBar: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 10,
    width: "min(95vw, 900px)",
    padding: 8,
    background: "#bdbdbd",
    borderTop: "2px solid #fff",
    borderLeft: "2px solid #fff",
    borderRight: "2px solid #404040",
    borderBottom: "2px solid #404040",
  },
  counterBox: { display: "flex", justifyContent: "center" },
  counter: {
    minWidth: 72,
    padding: "4px 8px",
    background: "#000",
    color: "#ff2d2d",
    fontFamily: "monospace",
    fontSize: 22,
    lineHeight: "22px",
    textAlign: "right",
    borderTop: "2px solid #404040",
    borderLeft: "2px solid #404040",
    borderRight: "2px solid #fff",
    borderBottom: "2px solid #fff",
  },
  smiley: {
    width: 36,
    height: 36,
    fontSize: 18,
    lineHeight: "36px",
    background: "#c0c0c0",
    borderTop: "2px solid #fff",
    borderLeft: "2px solid #fff",
    borderRight: "2px solid #404040",
    borderBottom: "2px solid #404040",
    cursor: "pointer",
  },
  toolbar: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    width: "min(95vw, 900px)",
  },
  label: { fontSize: 14 },
  select: {
    background: "#fff",
    color: "#000",
    border: "1px solid #777",
    padding: "4px 8px",
  },
  smallNote: { fontSize: 12, opacity: 0.8 },
  boardFrame: {
    width: "min(95vw, 900px)",
    overflow: "auto",
    padding: 6,
    background: "#bdbdbd",
    borderTop: "2px solid #fff",
    borderLeft: "2px solid #fff",
    borderRight: "2px solid #404040",
    borderBottom: "2px solid #404040",
  },
  boardOuter: {
    padding: 6,
    background: "#bdbdbd",
    borderTop: "2px solid #404040",
    borderLeft: "2px solid #404040",
    borderRight: "2px solid #fff",
    borderBottom: "2px solid #fff",
    margin: "0 auto",
  },
  boardGrid: {
    display: "grid",
    gap: 0,
  },
  cellBase: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    userSelect: "none",
    padding: 0,
    border: "none",
  },
  cellCovered: {
    background: "#c0c0c0",
    boxShadow: "inset -2px -2px 0 #404040, inset 2px 2px 0 #fff",
    cursor: "pointer",
  },
  cellRevealed: {
    background: "#e5e5e5",
    boxShadow: "inset 1px 1px 0 #fff, inset -1px -1px 0 #404040",
  },
  footer: { fontSize: 12, opacity: 0.9, marginTop: 6 },
};
