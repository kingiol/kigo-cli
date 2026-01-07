/**
 * Terminal theme detection
 */

export interface TerminalTheme {
  isDark: boolean;
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    dim: string;
  };
}

export function detectTerminalTheme(): TerminalTheme {
  // Check for common dark mode indicators
  const isDark = isDarkTerminal();

  if (isDark) {
    return {
      isDark: true,
      colors: {
        primary: '#7dd3fc', // light blue
        secondary: '#94a3b8', // slate
        success: '#4ade80', // green
        warning: '#fbbf24', // amber
        error: '#f87171', // red
        dim: '#64748b', // slate-500
      },
    };
  }

  return {
    isDark: false,
    colors: {
      primary: '#0284c7', // blue-600
      secondary: '#64748b', // slate-500
      success: '#16a34a', // green-600
      warning: '#ca8a04', // yellow-600
      error: '#dc2626', // red-600
      dim: '#94a3b8', // slate-400
    },
  };
}

function isDarkTerminal(): boolean {
  // Check environment variables
  if (process.env.TERM_PROGRAM === 'iTerm.app') {
    // iTerm2 - check for dark theme preference
    return true; // Default to dark for iTerm
  }

  if (process.env.TERM_PROGRAM === 'vscode') {
    // VS Code terminal
    return true; // Default to dark for VS Code
  }

  // Check COLORFGBG environment variable
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const fg = parseInt(colorFgBg.split(';')[0], 10);
    // Light background typically has fg > 7
    return fg <= 7;
  }

  // Default to dark mode
  return true;
}