import { Format } from "./format";
import { BinaryNumber, Keywords, Operators } from "./lexer";
import { Expression, ExpressionType, Statement, StatementType } from "./parser";
import { getCombinations, POSITION_NOT_SET, RANGE_NOT_SET } from "./utils";

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
          // TODO
        }
        break;
      case Keywords.Table:
        {
          // TODO
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

  public showExpression(
    expr: Expression,
    inlineFunctions: boolean = false
  ): string {
    return ""
  }

  public generateTruthTable(expr: Expression) {
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

  private convertFunctionTableToFunction(
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
}
