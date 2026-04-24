"use client";

export function PrintButton() {
  return (
    <button
      className="print-btn no-print"
      onClick={() => window.print()}
    >
      🖨️ Chapisha
    </button>
  );
}
