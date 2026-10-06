export interface MathResult {
  value: number;
  steps: string[];
}

/**
 * Evaluates simple arithmetic, and solves single-variable linear equations of the
 * form ax + b = c. Implemented as an explicit tokenizer + shunting-yard parser rather
 * than eval(), because the input is OCR'd text from an arbitrary photo and eval would
 * execute whatever it happened to read.
 */
export function solveMath(expression: string): MathResult | null {
  const normalized = expression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes("=")) return solveLinearEquation(normalized);

  const value = evaluateArithmetic(normalized.replace(/x/gi, "*"));
  if (value === null) return null;
  return { value, steps: [`${normalized.trim()} = ${formatNumber(value)}`] };
}

function solveLinearEquation(equation: string): MathResult | null {
  const [lhsRaw, rhsRaw] = equation.split("=");
  if (!lhsRaw || rhsRaw === undefined) return null;

  const lhs = parseLinearSide(lhsRaw);
  const rhs = parseLinearSide(rhsRaw);
  if (!lhs || !rhs) return null;

  // (aL - aR)x = (cR - cL)
  const a = lhs.coefficient - rhs.coefficient;
  const c = rhs.constant - lhs.constant;
  if (a === 0) return null;

  const value = c / a;
  const steps: string[] = [`${equation.trim()}`];
  if (lhs.constant !== 0) {
    steps.push(`${formatNumber(lhs.coefficient)}x = ${formatNumber(rhs.constant)} - ${formatNumber(lhs.constant)}`);
  }
  steps.push(`${formatNumber(a)}x = ${formatNumber(c)}`);
  steps.push(`x = ${formatNumber(c)} / ${formatNumber(a)}`);
  steps.push(`x = ${formatNumber(value)}`);

  return { value, steps };
}

function parseLinearSide(side: string): { coefficient: number; constant: number } | null {
  let coefficient = 0;
  let constant = 0;

  // Split into signed terms: "3x + 7" -> ["+3x", "+7"]
  const terms = side.replace(/\s+/g, "").replace(/-/g, "+-").split("+").filter(Boolean);
  if (terms.length === 0) return null;

  for (const term of terms) {
    const variableMatch = term.match(/^(-?\d*\.?\d*)[a-wyz]$/i) || term.match(/^(-?\d*\.?\d*)x$/i);
    if (variableMatch) {
      const raw = variableMatch[1];
      if (raw === "" || raw === "+") coefficient += 1;
      else if (raw === "-") coefficient -= 1;
      else coefficient += Number(raw);
      continue;
    }
    if (/^-?\d*\.?\d+$/.test(term)) {
      constant += Number(term);
      continue;
    }
    return null; // something we don't understand — don't guess
  }

  return { coefficient, constant };
}

type Token = { type: "number"; value: number } | { type: "op"; value: string } | { type: "paren"; value: "(" | ")" };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === " ") {
      i++;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let num = "";
      while (i < input.length && /[\d.]/.test(input[i])) num += input[i++];
      const value = Number(num);
      if (Number.isNaN(value)) return null;
      tokens.push({ type: "number", value });
      continue;
    }
    if ("+-*/^".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
      continue;
    }
    return null; // unknown character — refuse rather than guess
  }

  return tokens;
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };

export function evaluateArithmetic(input: string): number | null {
  const tokens = tokenize(input);
  if (!tokens || tokens.length === 0) return null;

  const output: Token[] = [];
  const operators: Token[] = [];

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];

    if (token.type === "number") {
      output.push(token);
    } else if (token.type === "op") {
      // Unary minus: treat "-5" / "(-5)" as 0 - 5
      const prev = tokens[idx - 1];
      const isUnary = token.value === "-" && (!prev || prev.type === "op" || (prev.type === "paren" && prev.value === "("));
      if (isUnary) {
        output.push({ type: "number", value: 0 });
      }
      while (operators.length) {
        const top = operators[operators.length - 1];
        if (top.type === "op" && PRECEDENCE[top.value] >= PRECEDENCE[token.value]) {
          output.push(operators.pop()!);
        } else break;
      }
      operators.push(token);
    } else if (token.value === "(") {
      operators.push(token);
    } else {
      let matched = false;
      while (operators.length) {
        const top = operators.pop()!;
        if (top.type === "paren" && top.value === "(") {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) return null; // unbalanced parentheses
    }
  }

  while (operators.length) {
    const top = operators.pop()!;
    if (top.type === "paren") return null;
    output.push(top);
  }

  const stack: number[] = [];
  for (const token of output) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }
    if (token.type !== "op") return null;
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) return null;
    switch (token.value) {
      case "+":
        stack.push(a + b);
        break;
      case "-":
        stack.push(a - b);
        break;
      case "*":
        stack.push(a * b);
        break;
      case "/":
        if (b === 0) return null;
        stack.push(a / b);
        break;
      case "^":
        stack.push(Math.pow(a, b));
        break;
      default:
        return null;
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) return null;
  return stack[0];
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10000) / 10000);
}
