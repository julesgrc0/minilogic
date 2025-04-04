import { Lexer, Operators } from "./lexer";
import {
  Parser,
  Statement,
  Expression,
  StatementType,
  ExpressionType,
} from "./parser";

class ExpressionOptimizer {
  constructor(private ast: Statement[]) {}

  public optimize(): Statement[] {
    for (const stmt of this.ast) {
      if (
        stmt.type === StatementType.Assignment ||
        stmt.type === StatementType.FunctionDefinition
      ) {
        stmt.expression = this.removeDeadCode(stmt.expression);
        stmt.expression = this.regroupExpressions(stmt.expression);
      }
    }

    return this.ast;
  }

  private removeDeadCode(expr: Expression): Expression {
    if (expr.type === ExpressionType.BinaryExpression) {
      const left = this.removeDeadCode(expr.left);
      const right = this.removeDeadCode(expr.right);

      if (expr.operator === Operators.Or) {
        if (left.type === ExpressionType.Number && left.value === 1)
          return left;
        if (right.type === ExpressionType.Number && right.value === 1)
          return right;
        if (JSON.stringify(left) === JSON.stringify(right)) return left;
      }

      if (expr.operator === Operators.And) {
        if (left.type === ExpressionType.Number && left.value === 0)
          return left;
        if (right.type === ExpressionType.Number && right.value === 0)
          return right;
        if (JSON.stringify(left) === JSON.stringify(right)) return left;
      }

      return { ...expr, left, right };
    }

    if (
      expr.type === ExpressionType.UnaryExpression &&
      expr.operator === Operators.Not
    ) {
      const subExpr = this.removeDeadCode(expr.operand);

      if (
        subExpr.type === ExpressionType.UnaryExpression &&
        subExpr.operator === Operators.Not
      ) {
        return subExpr.operand;
      }

      return { ...expr, operand: subExpr };
    }

    return expr;
  }

  private regroupExpressions(expr: Expression): Expression {
    if (
      expr.type === ExpressionType.UnaryExpression &&
      expr.operator === Operators.Not
    ) {
      const subExpr = expr.operand;
      if (
        subExpr.type === ExpressionType.UnaryExpression &&
        subExpr.operator === Operators.Not
      ) {
        return this.regroupExpressions(subExpr.operand);
      } else if (subExpr.type === ExpressionType.BinaryExpression) {
        const regroupeCases: Omit<
          Record<Operators, Operators>,
          Operators.Not
        > = {
          [Operators.And]: Operators.Nand,
          [Operators.Or]: Operators.Nor,
          [Operators.Xor]: Operators.Xnor,
          [Operators.Imply]: Operators.Nimply,
          [Operators.Equal]: Operators.Nequal,

          [Operators.Nand]: Operators.And,
          [Operators.Nor]: Operators.Or,
          [Operators.Xnor]: Operators.Xor,
          [Operators.Nimply]: Operators.Imply,
          [Operators.Nequal]: Operators.Equal,
        };

        if (subExpr.operator in regroupeCases) {
          return {
            id: subExpr.id,
            type: ExpressionType.BinaryExpression,
            left: this.regroupExpressions(subExpr.left),
            operator:
              regroupeCases[subExpr.operator as keyof typeof regroupeCases],
            right: this.regroupExpressions(subExpr.right),
          };
        }
      }
    }
    return expr;
  }

  // private convertTableToExpression(func: Statement): Expression {
  //   if (func.type !== StatementType.FunctionDefinition) {
  //     throw new Error("Expected a function definition.");
  //   }

  //   for (const row of table.rows) {
  //     if (row.output === "X") continue; // Ignore don't care terms
  //     if (row.output === 0) continue;   // Ignore false outputs

  //     let term: Expression | null = null;

  //     for (let i = 0; i < row.input.length; i++) {
  //       const varName = params[i];
  //       const varExpr: Expression = { type: ExpressionType.Variable, name: varName, reference: false };
  //       const notVarExpr: Expression = { type: ExpressionType.UnaryExpression, operator: Operators.Not, operand: varExpr };

  //       const condition = row.input[i] === 1 ? varExpr : notVarExpr;

  //       term = term ? { type: ExpressionType.BinaryExpression, left: term, operator: Operators.And, right: condition } : condition;
  //     }

  //     if (term) {
  //       terms.push(term);
  //     }
  //   }

  //   // Combine all terms using OR
  //   return terms.length > 0 ? terms.reduce((acc, curr) => ({
  //     type: ExpressionType.BinaryExpression,
  //     left: acc,
  //     operator: Operators.Or,
  //     right: curr,
  //   })) : { type: ExpressionType.Number, value: 0 }; // If no 1s, return 0
  // }
}

// public applyRegrouping(): void {
//   for (const stmt of this.ast) {
//     if (stmt.type === "Assignment") {
//       stmt.expression = this.regroupExpressions(stmt.expression);
//     } else if (stmt.type === "FunctionDefinition") {
//       stmt.expression = this.regroupExpressions(stmt.expression);
//     }
//   }
// }

// https://en.wikipedia.org/wiki/Boolean_algebra
const main = () => {
  const program = `
        A = not not not not not B
        A = 1 or A and 0
        B = 0 and C
        B = (B and C) or (C and B)
    `;

  const lexer = new Lexer(program);
  const parser = new Parser(lexer);
  const ast = parser.parseProgram();

  const optimizer = new ExpressionOptimizer(ast);
  let before = JSON.stringify(ast, null, 2);
  let after = JSON.stringify(optimizer.optimize(), null, 2);

  console.log("Before optimization:\n", before);
  console.log("After optimization:\n", after);
};

main();
