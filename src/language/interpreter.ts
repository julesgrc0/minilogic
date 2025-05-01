import { Format } from "./format";
import { BinaryNumber, Keywords, Operators } from "./lexer";
import { Expression, ExpressionType, Statement, StatementType } from "./parser";
import {
  getCombinations,
  maxPosition,
  minPosition,
  RANGE_NOT_SET,
} from "./utils";

type MLCVariable = Record<string, BinaryNumber>;
type MLCFunction = Record<string, Statement & { type: StatementType.Function }>;

class Interpreter {
  private variables: MLCVariable = {};
  private functions: MLCFunction = {};
  private output: string[] = [];

  public constructor(private program: Statement[]) {}

  public execute(): string[] {
    for (const stmt of this.program) {
      switch (stmt.type) {
        case StatementType.Variable:
          {
            if (this.variables.hasOwnProperty(stmt.name)) {
              throw new Error(`Variable ${stmt.name} already defined`);
            }
            this.variables[stmt.name] = this.evalExpression(stmt.value);
          }
          break;
        case StatementType.Function:
          {
            if (this.functions.hasOwnProperty(stmt.name)) {
              throw new Error(`Function ${stmt.name} already defined`);
            }
            this.functions[stmt.name] = stmt;
          }
          break;
        case StatementType.FunctionTable: {
          if (this.functions.hasOwnProperty(stmt.name)) {
            throw new Error(`Function ${stmt.name} already defined`);
          }
          this.functions[stmt.name] = this.convertFunctionTableToFunction(stmt);
        }
        case StatementType.BuiltinCall:
          this.evalBuiltinStatement(stmt);
          break;
      }
    }
    return this.output;
  }

  private evalBuiltinStatement(stmt: Statement): void {
    if (stmt.type !== StatementType.BuiltinCall) {
      throw new Error(`Unexpected statement type: ${stmt.type}`);
    }

    switch (stmt.name) {
      case Keywords.Print:
        {
          this.output.push(
            stmt.parameters
              .map((param) => {
                if (param.type == ExpressionType.String) {
                  return param.value;
                }
                return this.evalExpression(param).toString();
              })
              .join(" ")
          );
        }
        break;
      case Keywords.Show:
        {
          this.output.push(
            stmt.parameters
              .map((param) => {
                return this.showExpression(param);
              })
              .join(" ")
          );
        }
        break;
      case Keywords.Table:
        {
          this.output.push(
            stmt.parameters
              .map((param) => this.showTruthTable(param))
              .join("\n")
          );
        }
        break;
      case Keywords.Graph:
      case Keywords.Export:
      case Keywords.Import:
        {
          throw new Error(`${stmt.name} is not supported yet`);
        }
        break;
      default:
        throw new Error(`Unexpected builtin call: ${stmt.name}`);
    }
  }

  private evalBuiltinExpression(expr: Expression): Expression {
    if (expr.type !== ExpressionType.BuiltinCall) {
      throw new Error(`Unexpected expression type: ${expr.type}`);
    }

    switch (expr.name) {
      case Keywords.SolvePOS:
      case Keywords.SolveSOP:
        return expr;
      case Keywords.ToNand:
      case Keywords.ToNor:
        return expr;
      default:
        throw new Error(`Unexpected builtin expression: ${expr.name}`);
    }
  }

  private evalUnaryExpression(
    op: Operators,
    operand: BinaryNumber
  ): BinaryNumber {
    switch (op) {
      case Operators.Not:
        return operand ? 0 : 1;
      default:
        throw new Error(`Unsupported unary operator: ${op}`);
    }
  }

  private evalBinaryExpression(
    op: Operators,
    left: BinaryNumber,
    right: BinaryNumber
  ): BinaryNumber {
    switch (op) {
      case Operators.And:
        return left && right;
      case Operators.Or:
        return left || right;
      case Operators.Xor:
        return (left ^ right) as BinaryNumber;
      case Operators.Nor:
        return left || right ? 0 : 1;
      case Operators.Nand:
        return left && right ? 0 : 1;
      case Operators.Xnor:
        return left ^ right ? 0 : 1;
      case Operators.Imply:
        return !left || right ? 1 : 0;
      case Operators.Nimply:
        return left && !right ? 1 : 0;
      default:
        throw new Error(`Unsupported binary operator: ${op}`);
    }
  }

  private evalVariableExpression(
    expr: Expression,
    localVariables: MLCVariable
  ): BinaryNumber {
    if (expr.type !== ExpressionType.Variable) {
      throw new Error(`Unexpected expression type: ${expr.type}`);
    }

    if (!this.variables.hasOwnProperty(expr.name)) {
      throw new Error(`Variable ${expr.name} not defined`);
    }

    if (localVariables.hasOwnProperty(expr.name)) {
      return localVariables[expr.name];
    }

    if (Object.keys(localVariables).length == 0) {
      if (expr.reference) {
        throw new Error(`Variable ${expr.name} is a reference`);
      }

      return this.variables[expr.name];
    } else {
      if (!expr.reference) {
        throw new Error(`Variable ${expr.name} is not a reference`);
      }

      return this.variables[expr.name];
    }
  }

  private evalFunctionExpression(
    expr: Expression,
    parentLocalVariables: MLCVariable
  ): BinaryNumber {
    if (expr.type !== ExpressionType.FunctionCall) {
      throw new Error(`Unexpected expression type: ${expr.type}`);
    }

    if (!this.functions.hasOwnProperty(expr.name)) {
      throw new Error(`Function ${expr.name} not defined`);
    }

    const func = this.functions[expr.name];
    if (func.type !== StatementType.Function) {
      throw new Error(`Expected function, got ${func.type}`);
    }
    if (func.parameters.length !== expr.parameters.length) {
      throw new Error(
        `Function ${func.name} expects ${func.parameters.length} parameters, got ${expr.parameters.length}`
      );
    }

    const localVariables: MLCVariable = {};
    for (let i = 0; i < func.parameters.length; i++) {
      localVariables[func.parameters[i]] = this.evalExpression(
        expr.parameters[i],
        parentLocalVariables
      );
    }

    return this.evalExpression(func.body, localVariables);
  }

  private evalExpression(
    expr: Expression,
    localVariables: MLCVariable = {}
  ): BinaryNumber {
    switch (expr.type) {
      case ExpressionType.Number:
        return expr.value;
      case ExpressionType.Variable:
        return this.evalVariableExpression(expr, localVariables);
      case ExpressionType.FunctionCall:
        return this.evalFunctionExpression(expr, localVariables);
      case ExpressionType.Binary: {
        const left = this.evalExpression(expr.left, localVariables);
        const right = this.evalExpression(expr.right, localVariables);
        return this.evalBinaryExpression(expr.operator, left, right);
      }
      case ExpressionType.Unary: {
        const operand = this.evalExpression(expr.operand, localVariables);
        return this.evalUnaryExpression(expr.operator, operand);
      }
      case ExpressionType.BuiltinCall:
        return this.evalExpression(
          this.evalBuiltinExpression(expr),
          localVariables
        );
      default:
        throw new Error("Unexpected expression type");
    }
  }

  private getVariableInExpression(expr: Expression): string[] {
    switch (expr.type) {
      case ExpressionType.Number:
        return [];
      case ExpressionType.Variable:
        return [expr.name];
      case ExpressionType.FunctionCall:
        return expr.parameters.flatMap((param) =>
          this.getVariableInExpression(param)
        );
      case ExpressionType.Binary:
        return [
          ...this.getVariableInExpression(expr.left),
          ...this.getVariableInExpression(expr.right),
        ];
      case ExpressionType.Unary:
        return this.getVariableInExpression(expr.operand);
      case ExpressionType.BuiltinCall:
        return this.getVariableInExpression(expr);
      default:
        throw new Error("Unexpected expression type");
    }
  }

  public getTruthTable(expr: Expression) {
    const header = ["", this.showExpression(expr)];

    const localVariables: MLCVariable = {};
    for (const variable of this.getVariableInExpression(expr)) {
      localVariables[variable] = 0;
    }

    const cmbs = getCombinations(Object.keys(localVariables).length);

    const rows: string[][] = [];
    for (const cmb of cmbs) {
      Object.keys(localVariables).forEach((key, i) => {
        localVariables[key] = cmb[i];
      });
      rows.push([
        cmb.join(""),
        this.evalExpression(expr, localVariables).toString(),
      ]);
    }

    return [header, ...rows];
  }

  public showTruthTable(expr: Expression | string[][]): string {
    let table: string[][] = expr as string[][]; 
    if(!(expr instanceof Array)) {
      table = this.getTruthTable(expr);
    }
    const header = table[0].map((col) => col.toString());

    const rows = table
      .slice(1)
      .map((row) => row.map((col) => col.toString()).join(" | "))
      .join("\n");
    const separator = header.map(() => "---").join(" | ");
    return `| ${header.join(" | ")} |\n| ${separator} |\n| ${rows} |`;
  }

  private showBuiltinExpression(
    expr: Expression & {
      type: ExpressionType.BuiltinCall;
    }
  ): string {
    switch (expr.name) {
      case Keywords.ToNand:
        return this.showExpression(
          this.convertExpressionToLogicGate(expr, Operators.Nand)
        );
      case Keywords.ToNor:
        return this.showExpression(
          this.convertExpressionToLogicGate(expr, Operators.Nor)
        );
      case Keywords.SolvePOS:
      case Keywords.SolveSOP:
        // TODO: Implement SOLVE
        return this.showExpression(expr.parameters[0]);
      default:
        throw new Error(`Unexpected builtin expression: ${expr.name}`);
    }
  }

  public showExpression(
    expr: Expression,
    inlineFunctions: boolean = false,
    replace: Record<string, string> = {}
  ): string {
    switch (expr.type) {
      case ExpressionType.String:
      case ExpressionType.Number:
        return expr.value.toString();
      case ExpressionType.Variable: {
        if (replace.hasOwnProperty(expr.name)) {
          return replace[expr.name];
        }
        return expr.name + (expr.reference ? "*" : "");
      }
      case ExpressionType.FunctionCall: {
        const params = expr.parameters.map((param) =>
          this.showExpression(param, inlineFunctions, replace)
        );
        const str = `${expr.name}(${params.join(", ")})`;
        if (inlineFunctions) {
          const func = this.functions[expr.name];
          if (!func) throw new Error(`Function ${expr.name} not defined`);

          const newReplace: Record<string, string> = {};
          func.parameters.forEach((param, i) => {
            newReplace[param] = params[i];
          });
          return str + " = " + this.showExpression(func.body, true, newReplace);
        }
        return str;
      }
      case ExpressionType.Binary:
        return `(${this.showExpression(expr.left, inlineFunctions, replace)} ${
          expr.operator
        } ${this.showExpression(expr.right, inlineFunctions, replace)})`;
      case ExpressionType.Unary:
        return `${expr.operator} ${this.showExpression(
          expr.operand,
          inlineFunctions,
          replace
        )}`;
      case ExpressionType.BuiltinCall: {
        switch (expr.name) {
          case Keywords.ToNand:
          case Keywords.ToNor:
          case Keywords.SolvePOS:
          case Keywords.SolveSOP:
            const params = expr.parameters.map((param) =>
              this.showExpression(param, inlineFunctions, replace)
            );
            return `<${expr.name}>(${params.join(
              ", "
            )}) = ${this.showBuiltinExpression(expr)}`;
          default:
            throw new Error(`Unexpected builtin expression: ${expr.name}`);
        }
      }
      case ExpressionType.Error:
        throw new Error(expr.message);
    }
  }

  public convertFunctionTableToFunction(
    stmt: Statement & { type: StatementType.FunctionTable }
  ): Statement & { type: StatementType.Function } {
    const minterms: Expression[] = [];

    for (const row of stmt.table) {
      const terms: Expression[] = [];

      for (let i = 0; i < row.index.length; i++) {
        terms.push({
          type: ExpressionType.Binary,
          operator: row.index[i] == 1 ? Operators.And : Operators.Nand,
          left: {
            type: ExpressionType.Variable,
            name: stmt.parameters[i],
            reference: false,
            range: RANGE_NOT_SET,
          },
          right: row.value,
          range: RANGE_NOT_SET,
        });
      }

      minterms.push(
        terms.reduce((a, b) => ({
          type: ExpressionType.Binary,
          operator: Operators.And,
          left: a,
          right: b,
          range: RANGE_NOT_SET,
        }))
      );
    }

    const body: Expression =
      minterms.length === 0
        ? { type: ExpressionType.Number, value: 0, range: RANGE_NOT_SET }
        : minterms.reduce((a, b) => ({
            type: ExpressionType.Binary,
            operator: Operators.Or,
            left: a,
            right: b,
            range: RANGE_NOT_SET,
          }));

    return {
      type: StatementType.Function,
      name: stmt.name,
      parameters: stmt.parameters,
      body,
      range: RANGE_NOT_SET,
    };
  }

  public convertExpressionToLogicGate(
    expr: Expression,
    operator: Operators
  ): Expression {
    const logicGate = (a: Expression, b: Expression): Expression => ({
      type: ExpressionType.Binary,
      operator,
      left: a,
      right: b,
      range: {
        start: minPosition(a.range.start, b.range.start),
        end: maxPosition(a.range.end, b.range.end),
      },
    });

    switch (expr.type) {
      case ExpressionType.Unary: {
        const inner = this.convertExpressionToLogicGate(expr.operand, operator);
        return logicGate(inner, inner);
      }
      case ExpressionType.Binary: {
        const left = this.convertExpressionToLogicGate(expr.left, operator);
        const right = this.convertExpressionToLogicGate(expr.right, operator);

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
              const a = logicGate(
                logicGate(left, left),
                logicGate(right, right)
              );
              return logicGate(a, a);
            }
            return expr;

          case Operators.Nor:
            if (operator == Operators.Nand) {
              const a = logicGate(
                logicGate(left, left),
                logicGate(right, right)
              );
              return logicGate(a, a);
            }
            return expr;

          case Operators.Not:
            return expr;
          default:
            return expr;
        }
      }
      case ExpressionType.BuiltinCall:
      case ExpressionType.FunctionCall:
        return {
          ...expr,
          parameters: expr.parameters.map((arg) =>
            this.convertExpressionToLogicGate(arg, operator)
          ),
        };
      default:
        return expr;
    }
  }
}

export { Interpreter };