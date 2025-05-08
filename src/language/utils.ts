import * as vscode from "vscode";
import { BinaryNumber, Position, Range } from "./lexer";
import { Expression, ExpressionType, Statement, StatementType } from "./parser";
import update from "../commands/update";

// CODE FROM: https://github.com/gustf/js-levenshtein/tree/master
const levenshteinDistance = (a: string, b: string): number => {
  const _min = (d0: number, d1: number, d2: number, bx: number, ay: number) => {
    return d0 < d1 || d2 < d1
      ? d0 > d2
        ? d2 + 1
        : d0 + 1
      : bx === ay
        ? d1
        : d1 + 1;
  };

  if (a === b) {
    return 0;
  }

  if (a.length > b.length) {
    let tmp = a;
    a = b;
    b = tmp;
  }

  let la = a.length;
  let lb = b.length;

  while (la > 0 && a.charCodeAt(la - 1) === b.charCodeAt(lb - 1)) {
    la--;
    lb--;
  }

  let offset = 0;

  while (offset < la && a.charCodeAt(offset) === b.charCodeAt(offset)) {
    offset++;
  }

  la -= offset;
  lb -= offset;

  if (la === 0 || lb < 3) {
    return lb;
  }

  let x = 0;
  let y;
  let d0;
  let d1;
  let d2;
  let d3;
  let dd;
  let dy;
  let ay;
  let bx0;
  let bx1;
  let bx2;
  let bx3;

  let vector = [];

  for (y = 0; y < la; y++) {
    vector.push(y + 1);
    vector.push(a.charCodeAt(offset + y));
  }

  let len = vector.length - 1;

  for (; x < lb - 3; ) {
    bx0 = b.charCodeAt(offset + (d0 = x));
    bx1 = b.charCodeAt(offset + (d1 = x + 1));
    bx2 = b.charCodeAt(offset + (d2 = x + 2));
    bx3 = b.charCodeAt(offset + (d3 = x + 3));
    dd = x += 4;
    for (y = 0; y < len; y += 2) {
      dy = vector[y];
      ay = vector[y + 1];
      d0 = _min(dy, d0, d1, bx0, ay);
      d1 = _min(d0, d1, d2, bx1, ay);
      d2 = _min(d1, d2, d3, bx2, ay);
      dd = _min(d2, d3, dd, bx3, ay);
      vector[y] = dd;
      d3 = d2;
      d2 = d1;
      d1 = d0;
      d0 = dy;
    }
  }

  for (; x < lb; ) {
    bx0 = b.charCodeAt(offset + (d0 = x));
    dd = ++x;
    for (y = 0; y < len; y += 2) {
      dy = vector[y];
      vector[y] = dd = _min(dy, d0, dd, bx0, vector[y + 1]);
      d0 = dy;
    }
  }

  return dd as number;
};

const getCombinations = (n: number): BinaryNumber[][] => {
  const result: BinaryNumber[][] = [];
  for (let i = 0; i < 1 << n; i++) {
    const row: BinaryNumber[] = [];
    for (let j = n - 1; j >= 0; j--) {
      row.push(((i >> j) & 1) as BinaryNumber);
    }
    result.push(row);
  }
  return result;
};

const POSITION_NOT_SET: Position = { line: -1, column: -1, offset: -1 };
const RANGE_NOT_SET = { start: POSITION_NOT_SET, end: POSITION_NOT_SET };

const minPosition = (a: Position, b: Position): Position =>
  Math.min(a.offset, b.offset) === a.offset ? a : b;
const maxPosition = (a: Position, b: Position): Position =>
  Math.max(a.offset, b.offset) === a.offset ? a : b;

const isPositionSet = (pos: Position): boolean =>
  pos.line !== -1 && pos.column !== -1 && pos.offset !== -1;
const isRangeSet = (range: { start: Position; end: Position }): boolean => {
  return isPositionSet(range.start) && isPositionSet(range.end);
};

const expressionEqual = (a: Expression, b: Expression): boolean => {
  if (a.type !== b.type) return false;

  const bexpr = b as any;
  switch (a.type) {
    case ExpressionType.Number:
      return a.value === bexpr.value;
    case ExpressionType.String:
      return a.value === bexpr.value;
    case ExpressionType.Binary:
      return (
        a.operator === bexpr.operator &&
        expressionEqual(a.left, bexpr.left) &&
        expressionEqual(a.right, bexpr.right)
      );
    case ExpressionType.Unary:
      return (
        a.operator === bexpr.operator &&
        expressionEqual(a.operand, bexpr.operand)
      );
    case ExpressionType.BuiltinCall:
    case ExpressionType.FunctionCall:
      if (a.name !== bexpr.name) return false;
      if (a.parameters.length !== bexpr.parameters.length) return false;
      for (let i = 0; i < a.parameters.length; i++) {
        if (!expressionEqual(a.parameters[i], bexpr.parameters[i]))
          return false;
      }
      return true;
    case ExpressionType.Variable:
      return a.name === bexpr.name && a.reference === bexpr.reference;
    case ExpressionType.Error:
      return a.message === bexpr.message;
    default:
      return false;
  }
};
const convertPosition = (pos: Position): vscode.Position =>
  new vscode.Position(pos.line, pos.column);

const convertRange = (range: {
  start: Position;
  end: Position;
}): vscode.Range => {
  return new vscode.Range(
    convertPosition(range.start),
    convertPosition(range.end),
  );
};
const positionDistance = (a: Position, b: Position): number => {
  return Math.sqrt(
    Math.pow(a.line - b.line, 2) + Math.pow(a.column - b.column, 2),
  );
};

const findNearestToPosition = (
  position: Position,
  ast: Statement[],
): Statement | null => {
  let nearest: Statement | null = null;
  let dist = Number.MAX_VALUE;

  for (const stmt of ast) {
    let a = positionDistance(position, stmt.range.start);
    let b = positionDistance(position, stmt.range.end);

    if (a < dist || b < dist) {
      dist = Math.min(a, b);
      nearest = stmt;
    }
  }

  return nearest;
};

const findNearestToLine = (
  line: number,
  ast: Statement[],
): Statement | null => {
  let nearest: Statement | null = null;
  let dist = Number.MAX_VALUE;
  for (const stmt of ast) {
    let a = Math.abs(line - stmt.range.start.line);
    let b = Math.abs(line - stmt.range.end.line);

    if (a < dist || b < dist) {
      dist = Math.min(a, b);
      nearest = stmt;
    }
  }
  return nearest;
};

const hasErrorInExpression = (expr: Expression): boolean => {
  if (expr.type === ExpressionType.Error) return true;
  switch (expr.type) {
    case ExpressionType.Binary:
      return (
        hasErrorInExpression(expr.left) || hasErrorInExpression(expr.right)
      );
    case ExpressionType.Unary:
      return hasErrorInExpression(expr.operand);
    case ExpressionType.BuiltinCall:
    case ExpressionType.FunctionCall:
      return expr.parameters.some((param) => hasErrorInExpression(param));
    default:
      return false;
  }
};

const findExpressionInStatements = (
  expr: Expression,
  ast: Statement[],
): Statement | undefined => {
  const isInsideExpr = (inexpr: Expression): boolean => {
    if (expressionEqual(inexpr, expr)) return true;
    switch (inexpr.type) {
      case ExpressionType.Binary:
        return isInsideExpr(inexpr.left) || isInsideExpr(inexpr.right);
      case ExpressionType.Unary:
        return isInsideExpr(inexpr.operand);
      case ExpressionType.BuiltinCall:
      case ExpressionType.FunctionCall:
        return inexpr.parameters.some((param) => isInsideExpr(param));
      default:
        return false;
    }
  };

  for (const stmt of ast) {
    switch (stmt.type) {
      case StatementType.Variable:
        if (isInsideExpr(stmt.value)) {
          return stmt;
        }
        break;
      case StatementType.Function:
        if (isInsideExpr(stmt.body)) {
          return stmt;
        }
        break;
      case StatementType.FunctionTable:
        if (
          stmt.table.some((row) => {
            if (isInsideExpr(row.value)) {
              return true;
            }
            return false;
          })
        ) {
          return stmt;
        }
        break;
      case StatementType.BuiltinCall:
        if (stmt.parameters.some((param) => isInsideExpr(param))) {
          return stmt;
        }
        break;
      default:
        break;
    }
  }
  return undefined;
};

export {
  levenshteinDistance,
  getCombinations,
  expressionEqual,
  minPosition,
  maxPosition,
  isPositionSet,
  convertPosition,
  isRangeSet,
  positionDistance,
  findNearestToPosition,
  findNearestToLine,
  findExpressionInStatements,
  hasErrorInExpression,
  convertRange,
  POSITION_NOT_SET,
  RANGE_NOT_SET,
};
