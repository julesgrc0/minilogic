import { Formatter } from "./formatter";
import { Lexer, Operators } from "./lexer";
import {
  Parser,
  Statement,
  Expression,
  StatementType,
  ExpressionType,
} from "./parser";

enum StatementOptimizationType {
  SIMPLIFY_EXPRESSION = "simplify_expression",
  REMOVE_STATEMENT = "remove_statement",
}

type StatementOptimization = (
  | {
      type: StatementOptimizationType.SIMPLIFY_EXPRESSION;
      line: string;
    }
  | {
      type: StatementOptimizationType.REMOVE_STATEMENT;
    }
) & {
  message: string;
  fixId: number;
};

class Optimizer {
  private optimizations: StatementOptimization[] = [];

  constructor(private ast: Statement[]) {}

  public optimize(): StatementOptimization[] {
    for (const stmt of this.ast) {
      if (
        stmt.type === StatementType.Assignment ||
        stmt.type === StatementType.FunctionDefinition
      ) {
        const deadCodeExpr = this.removeDeadCode(stmt.expression);
        if (!this.isSameExpressions(stmt.expression, deadCodeExpr)) {
          const exprStr = this.getStatmentToString({
            ...stmt,
            expression: deadCodeExpr,
          });
          this.optimizations.push({
            type: StatementOptimizationType.SIMPLIFY_EXPRESSION,
            line: exprStr,
            message: `This expression can be simplified to ${exprStr}`,
            fixId: stmt.id,
          });
          continue;
        }

        const simplifyNot = this.simplifyNot(stmt.expression);
        if (!this.isSameExpressions(stmt.expression, simplifyNot)) {
          const exprStr = this.getStatmentToString({
            ...stmt,
            expression: simplifyNot,
          });
          this.optimizations.push({
            type: StatementOptimizationType.SIMPLIFY_EXPRESSION,
            line: exprStr,
            message: `This expression can be simplified to ${exprStr}`,
            fixId: stmt.id,
          });
        }
      }
    }

    const unusedFunctions = this.getUnusedFunctions();
    for (const id of unusedFunctions) {
      this.optimizations.push({
        type: StatementOptimizationType.REMOVE_STATEMENT,
        message: `This function is never used`,
        fixId: id,
      });
    }

    const unusedVariables = this.getUnusedVariables();

    for (const id of unusedVariables) {
      this.optimizations.push({
        type: StatementOptimizationType.REMOVE_STATEMENT,
        message: `This variable is never used`,
        fixId: id,
      });
    }

    return this.optimizations;
  }

  private getStatmentToString(stmt: Statement): string {
    return new Formatter([stmt]).format().replace(/\n/g, " ").trim();
  }

  private getUnusedFunctions(): number[] {
    const functions: Record<string, number> = {};
    for (const stmt of this.ast) {
      switch (stmt.type) {
        case StatementType.FunctionDefinition:
          functions[stmt.name] = stmt.id;
          break;

        case StatementType.BuiltinCall:
        case StatementType.Assignment:
          const expr =
            stmt.type == StatementType.Assignment
              ? [stmt.expression]
              : stmt.args;
          for (const funcname of Object.keys(functions)) {
            if (functions[funcname] == -1) {
              continue;
            }
            for (const exprItem of expr) {
              const found = this.findUsedFunctions(funcname, exprItem);
              if (found) {
                functions[funcname] = -1;
                break;
              }
            }
          }
          break;
      }
    }

    return Object.values(functions).filter((key) => key != -1);
  }

  private getUnusedVariables(): number[] {
    const variables: Record<string, number> = {};

    for (const stmt of this.ast) {
      switch (stmt.type) {
        case StatementType.Assignment:
          variables[stmt.variable] = stmt.id;
          break;
        case StatementType.FunctionDefinition:
        case StatementType.BuiltinCall:
          const args =
            stmt.type == StatementType.FunctionDefinition
              ? [stmt.expression]
              : stmt.args;
          for (let expr of args) {
            const vars = Object.keys(variables);
            for (let varname of vars) {
              if (variables[varname] == -1) {
                continue;
              }

              const found = this.findUsedVariables(
                varname,
                stmt.type == StatementType.FunctionDefinition,
                expr
              );
              if (found) {
                variables[varname] = -1;
                break;
              }
            }
          }
          break;
      }
    }

    return Object.values(variables).filter((key) => key != -1);
  }

  private isSameExpressions(expr1: Expression, expr2: Expression): boolean {
    return JSON.stringify(expr1) === JSON.stringify(expr2);
  }

  private findUsedVariables(
    varname: string,
    isfunction: boolean,
    expr: Expression
  ): boolean {
    switch (expr.type) {
      case ExpressionType.Number:
        return false;
      case ExpressionType.Variable:
        if (isfunction && !expr.reference) {
          return false;
        }
        return expr.name === varname;
      case ExpressionType.BinaryExpression:
        return (
          this.findUsedVariables(varname, isfunction, expr.left) ||
          this.findUsedVariables(varname, isfunction, expr.right)
        );
      case ExpressionType.UnaryExpression:
        return this.findUsedVariables(varname, isfunction, expr.operand);
      case ExpressionType.FunctionCall:
        return expr.args.some((arg) =>
          this.findUsedVariables(varname, true, arg)
        );
      case ExpressionType.BuiltinCall:
        return this.findUsedVariables(varname, isfunction, expr.operand);
      case ExpressionType.TableDefinition:
      case "Error":
        return false;
    }
  }

  private findUsedFunctions(funcname: string, expr: Expression): boolean {
    switch (expr.type) {
      case ExpressionType.Number:
        return false;
      case ExpressionType.Variable:
        return false;
      case ExpressionType.BinaryExpression:
        return (
          this.findUsedFunctions(funcname, expr.left) ||
          this.findUsedFunctions(funcname, expr.right)
        );
      case ExpressionType.UnaryExpression:
        return this.findUsedFunctions(funcname, expr.operand);
      case ExpressionType.FunctionCall:
        if (expr.name === funcname) {
          return true;
        }
        return expr.args.some((arg) => this.findUsedFunctions(funcname, arg));
      case ExpressionType.BuiltinCall:
        return this.findUsedFunctions(funcname, expr.operand);
      case "Error":
      case ExpressionType.TableDefinition:
        return false;
    }
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

        if (left.type === ExpressionType.Number && left.value === 0)
          return right;
        if (right.type === ExpressionType.Number && right.value === 0)
          return left;

        if (JSON.stringify(left) === JSON.stringify(right)) return left;
      }

      if (expr.operator === Operators.And) {
        if (left.type === ExpressionType.Number && left.value === 0)
          return left;
        if (right.type === ExpressionType.Number && right.value === 0)
          return right;

        if (left.type === ExpressionType.Number && left.value === 1)
          return right;
        if (right.type === ExpressionType.Number && right.value === 1)
          return left;

        if (JSON.stringify(left) === JSON.stringify(right)) return left;
      }

      return { ...expr, left, right };
    }

    return expr;
  }

  private simplifyNot(expr: Expression): Expression {
    if (
      expr.type === ExpressionType.UnaryExpression &&
      expr.operator === Operators.Not
    ) {
      const subExpr = expr.operand;
      if (
        subExpr.type === ExpressionType.UnaryExpression &&
        subExpr.operator === Operators.Not
      ) {
        return this.simplifyNot(subExpr.operand);
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
            left: this.simplifyNot(subExpr.left),
            operator:
              regroupeCases[subExpr.operator as keyof typeof regroupeCases],
            right: this.simplifyNot(subExpr.right),
          };
        }
      }
    }
    return expr;
  }
}

export { Optimizer, StatementOptimizationType, StatementOptimization };

/* 
const test1 = () => {
  const program = `
        A = not not not not not B
        A = 1 or A and 0
        B = 0 and C
        B = (B and C) or (B and C)

        C = 1
        F(C) = C or C and C*

        PRINT(A)
    `;

  const lexer = new Lexer(program);
  const parser = new Parser(lexer);
  const ast = parser.parseProgram();

  const optimizer = new ExpressionOptimizer(ast);
  // const formatter = new Formatter(optimizer.optimize());

  //console.log(formatter.format());
};

test1(); */
/*
const test2 = () => {
  const program0 = `
          A = not not not not not B
          A = 1 or A and 0
          B = 0 and C*
          B = (B and C) or (C and B) and C*

          F(x, y) = x or z and G(not J)
          F = 1
          X = F(A, B or B, C)
          X() = A
          Y(A, B) = [
            001, 1
            11, 1
            11, 0
          ]

          PRINT(A or B and C, Y(0, 1))
          GRAPH(F, B)
      `;
  const program1 = `
        B = (1 or 0) and 1
        PRINT(B)

        G(A, B) = A xor B and 1
        F(A) = A and B* or G(A, A xor not A)
        PRINT(F(1))
        PRINT(F(0)) 
        SHOW(F(0))
        `;
  const program = `
    F(A, B) = [
      00, 0
      01, 1
      10, 0
      11, 1
    ]

    SHOW(F(A, B))
  `;

  const lexer = new Lexer(program0);

  let ast: Statement[];

  try {
    const parser = new Parser(lexer);
    ast = parser.parseProgram();
  } catch (e) {
    console.error("Error parsing program: ", (e as Error).message);
    return;
  }
  const analyzer = new SemanticAnalyzer(ast);
  const errors = analyzer.analyze();

  if (errors.length > 0) {
    for (const error of errors) {
      const token = lexer.getTokenById(error.position);

      console.error(
        `Error at position ${error.position} (${token?.value} ${token?.type}):  ${error.message}`
      );
    }
  } else {
    const interpreter = new Interpreter(ast);
    const output = interpreter.run();
    console.log(output.join("\n"));
  }
};

test2();
*/
