import { Formatter } from "./formatter";
import { Operators } from "./lexer";
import {
  BinaryNumber,
  Expression,
  ExpressionType,
  Statement,
  StatementType,
} from "./parser";

enum QuickFixType {
  CHANGE,
  REMOVE,
  NONE
}


type QuickFixStatement = (
  | {
      type: QuickFixType.CHANGE;
      line: string | { 
        value: string;
        at : number;
      };
    }
  | {
      type: QuickFixType.REMOVE;
    } 
  | {
      type: QuickFixType.NONE;
    }
) & {
  message: string;
  fixId: number;
};

const convertTableDefinitionToExpression = (
  stmt: Statement
): Expression | null => {
  if (
    stmt.type != StatementType.FunctionDefinition ||
    stmt.expression.type !== ExpressionType.TableDefinition
  )
    return null;

  const minterms: Expression[] = [];

  for (const row of stmt.expression.rows) {
    if (row.output[0] === 1) {
      const terms: Expression[] = [];

      for (let i = 0; i < row.input[0].length; i++) {
        const bit = row.input[0][i].value;
        const variable: Expression = {
          type: ExpressionType.Variable,
          name: stmt.parameters[i],
          reference: false,
          id: -1,
        };

        terms.push(
          bit === 1
            ? variable
            : {
                type: ExpressionType.UnaryExpression,
                operator: Operators.Not,
                operand: variable,
                id: -1,
              }
        );
      }

      const andExpr = terms.reduce((a, b) => ({
        type: ExpressionType.BinaryExpression,
        operator: Operators.And,
        left: a,
        right: b,
        id: -1,
      }));

      minterms.push(andExpr);
    }
  }

  if (minterms.length === 0) {
    return { type: ExpressionType.Number, value: 0, id: -1 };
  }

  const finalExpr = minterms.reduce((a, b) => ({
    type: ExpressionType.BinaryExpression,
    operator: Operators.Or,
    left: a,
    right: b,
    id: -1,
  }));

  return finalExpr;
};

const convertExpressionToLogicGate = (
  expr: Expression,
  operator: Operators
): Expression => {
  const logicGate = (a: Expression, b: Expression): Expression => ({
    type: ExpressionType.BinaryExpression,
    operator,
    left: a,
    right: b,
    id: -1,
  });

  switch (expr.type) {
    case ExpressionType.Variable:
    case ExpressionType.Number:
    case ExpressionType.TableDefinition:
    case "Error":
      return expr;

    case ExpressionType.UnaryExpression: {
      const inner = convertExpressionToLogicGate(expr.operand, operator);
      return logicGate(inner, inner);
    }

    case ExpressionType.BinaryExpression: {
      const left = convertExpressionToLogicGate(expr.left, operator);
      const right = convertExpressionToLogicGate(expr.right, operator);

      switch (expr.operator) {
        case Operators.And:
          if (operator == Operators.Nand) {
            const a = logicGate(left, right);
            return logicGate(a, a);
          } else {
            return logicGate(logicGate(left, left), logicGate(right, right));
          }

        case Operators.Or:
          if (operator == Operators.Nand) {
            return logicGate(logicGate(left, left), logicGate(right, right));
          } else {
            const a = logicGate(left, right);
            return logicGate(a, a);
          }

        case Operators.Xor: {
          const a = logicGate(left, right);
          const b = logicGate(left, a);
          const c = logicGate(right, a);
          return logicGate(b, c);
        }

        case Operators.Xnor: {
          const a = logicGate(left, right);
          const b = logicGate(left, a);
          const c = logicGate(right, a);
          const d = logicGate(b, c);
          return logicGate(d, d);
        }

        case Operators.Nand:
          if (operator == Operators.Nor) {
            const a = logicGate(logicGate(left, left), logicGate(right, right));
            return logicGate(a, a);
          }
          return expr;

        case Operators.Nor:
          if (operator == Operators.Nand) {
            const a = logicGate(logicGate(left, left), logicGate(right, right));
            return logicGate(a, a);
          }
          return expr;

        case Operators.Not:
          return expr;
        default:
          return expr;
      }
    }

    case ExpressionType.FunctionCall:
      return {
        ...expr,
        args: expr.args.map((arg) =>
          convertExpressionToLogicGate(arg, operator)
        ),
      };

    case ExpressionType.BuiltinCall:
      return {
        ...expr,
        operand: convertExpressionToLogicGate(expr.operand, operator),
      };
  }
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

const getStatmentToString = (stmt: Statement): string => {
  return Formatter.formatStatement(stmt).replace(/\n/g, " ").trim();
};

const getExpressionToString = (expr: Expression): string => {
    return Formatter.formatExpression(expr).replace(/\n/g, " ").trim();
}

const isSameExpressions = (expr1: Expression, expr2: Expression): boolean => {
  return JSON.stringify(expr1) === JSON.stringify(expr2);
};

export {
  QuickFixType, 
  QuickFixStatement,
  convertTableDefinitionToExpression,
  convertExpressionToLogicGate,
  getCombinations,
  getStatmentToString,
  getExpressionToString,
  isSameExpressions,
};
