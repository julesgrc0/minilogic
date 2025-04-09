import { Lexer, Operators } from "./lexer";
import {
  Statement,
  StatementType,
  Expression,
  ExpressionType,
  BinaryNumber,
  Parser,
  BuiltinType,
  builtinFunctions,
} from "./parser";
import { SemanticAnalyzer } from "./semantic_analyzer";

class Interpreter {
  private variables = new Map<string, BinaryNumber>();
  private functions = new Map<string, Statement>();
  private output: string[] = [];

  constructor(private ast: Statement[]) {}

  public run(): string[] {
    for (const stmt of this.ast) {
      this.execute(stmt);
    }
    return this.output;
  }

  private execute(stmt: Statement): void {
    switch (stmt.type) {
      case StatementType.Assignment:
        this.executeVariable(stmt);
        break;
      case StatementType.FunctionDefinition:
        this.executeFunction(stmt);
        break;
      case StatementType.BuiltinCall:
        this.executeBuiltin(stmt);
        break;
    }
  }

  private executeVariable(stmt: Statement): void {
    if (stmt.type !== StatementType.Assignment) {
      throw new Error(`Expected Assignment, got ${stmt.type}`);
    }
    if (this.variables.has(stmt.variable)) {
      throw new Error(`Variable ${stmt.variable} already defined`);
    }
    if (this.functions.has(stmt.variable)) {
      throw new Error(
        `Ambiguous variable name ${stmt.variable}, already used as function`
      );
    }

    this.variables.set(stmt.variable, this.evalExpression(stmt.expression));
  }

  private executeFunction(stmt: Statement): void {
    if (stmt.type !== StatementType.FunctionDefinition) {
      throw new Error(`Expected FunctionCall, got ${stmt.type}`);
    }
    if (this.functions.has(stmt.name)) {
      throw new Error(`Function ${stmt.name} already defined`);
    }
    if (this.variables.has(stmt.name)) {
      throw new Error(
        `Ambiguous function name ${stmt.name}, already used as variable`
      );
    }

    if (stmt.expression.type === ExpressionType.TableDefinition) {
      this.functions.set(stmt.name, {
        ...stmt,
        expression: this.convertTableToFunction(
          stmt.parameters,
          stmt.expression
        ),
      });

      return;
    }

    this.functions.set(stmt.name, stmt);
  }

  private executeBuiltin(stmt: Statement): void {
    if (stmt.type !== StatementType.BuiltinCall) {
      throw new Error(`Expected BuiltinCall, got ${stmt.type}`);
    }

    switch (stmt.name) {
      case BuiltinType.Print:
        const argsPrint = stmt.args.map((arg) => this.evalExpression(arg));
        this.output.push(argsPrint.join(", "));
        break;

      case BuiltinType.Show:
        const argsShow = stmt.args.map((arg) =>
          this.evalExpressionToString(arg, new Map(), true)
        );
        this.output.push(argsShow.join(", "));
        break;
      case BuiltinType.Graph:
        // TODO: Implement graphing logic
        break;
      case BuiltinType.Table:
        // TODO: Implement table logic
        break;
      case BuiltinType.Export:
        // TODO: Implement export logic
        break;
      default:
        throw new Error(`Invalid usage of builtin function: ${stmt.name}`);
    }
  }

  private evalExpressionToString(
    expr: Expression,
    replaceVar: Map<string, string> = new Map(),
    allowall: boolean = false
  ): string {
    switch (expr.type) {
      case ExpressionType.Number:
        return expr.value.toString();
      case ExpressionType.Variable:
        if (replaceVar.has(expr.name)) {
          return replaceVar.get(expr.name)!;
        }
        if (this.variables.has(expr.name)) {
          return expr.name + (expr.reference ? "*" : "");
        }

        if (allowall) {
          return expr.name + (expr.reference ? "*" : "");
        }

        throw new Error(`Undefined variable: ${expr.name}`);
      case ExpressionType.UnaryExpression: {
        const operand = this.evalExpressionToString(
          expr.operand,
          replaceVar,
          allowall
        );
        if (expr.operator === Operators.Not) {
          return `${expr.operator} ${operand}`;
        }
        return `${expr.operator}(${operand})`;
      }
      case ExpressionType.BinaryExpression: {
        const left = this.evalExpressionToString(
          expr.left,
          replaceVar,
          allowall
        );
        const right = this.evalExpressionToString(
          expr.right,
          replaceVar,
          allowall
        );
        if (
          expr.operator === Operators.And ||
          expr.operator === Operators.Nand
        ) {
          return `${left} ${expr.operator} ${right}`;
        }
        return `(${left} ${expr.operator} ${right})`;
      }
      case ExpressionType.FunctionCall:
        const func = this.functions.get(expr.name);
        if (!func || func.type !== StatementType.FunctionDefinition) {
          if (allowall) {
            return (
              expr.name +
              "(" +
              expr.args
                .map((arg) =>
                  this.evalExpressionToString(arg, replaceVar, allowall)
                )
                .join(", ") +
              ")"
            );
          }

          throw new Error(`Undefined function: ${expr.name}`);
        }

        const replacement = new Map<string, string>();
        if(func.parameters.length !== expr.args.length) {
          throw new Error(`Function ${func.name} called with ${expr.args.length} arguments, expected ${func.parameters.length}`);
        }

        for (let i = 0; i < func.parameters.length; i++) {
          replacement.set(
            func.parameters[i],
            this.evalExpressionToString(expr.args[i], replaceVar, allowall)
          );
        }
        const stringFunc = `${func.name}(${func.parameters
          .map((param) => replacement.get(param))
          .join(", ")})`;
        return `${stringFunc} = ${this.evalExpressionToString(
          func.expression,
          replacement,
          allowall
        )}`;
      case ExpressionType.BuiltinCall:
        return this.evalBuiltinFunctionCallToString(expr, replaceVar, allowall);
      case ExpressionType.TableDefinition:
        throw new Error("TableDefinition cannot be evaluated directly");
      case "Error":
        throw new Error(`ErrorCase: ${expr.message}`);
    }
  }

  private evalBuiltinFunctionCallToString(expr: Expression, replaceVar: Map<string, string>, allowall: boolean): string {
    return "";
  }

  private evalExpression(
    expr: Expression,
    localVariables: Map<string, BinaryNumber> = new Map()
  ): BinaryNumber {
    switch (expr.type) {
      case ExpressionType.Number:
        return expr.value;
      case ExpressionType.Variable:
        if (localVariables.size > 0) {
          if (expr.reference && !this.variables.has(expr.name)) {
            throw new Error(`Undefined variable reference: ${expr.name}`);
          }
          if (!expr.reference && !localVariables.has(expr.name)) {
            throw new Error(`Undefined variable: ${expr.name}`);
          }

          return expr.reference
            ? this.variables.get(expr.name)!
            : localVariables.get(expr.name)!;
        } else {
          if (!this.variables.has(expr.name)) {
            throw new Error(`Undefined variable: ${expr.name}`);
          }
          return this.variables.get(expr.name)!;
        }
      case ExpressionType.UnaryExpression: {
        const operand = this.evalExpression(expr.operand, localVariables);
        return this.evalUnary(expr.operator, operand);
      }
      case ExpressionType.BinaryExpression: {
        const left = this.evalExpression(expr.left, localVariables);
        const right = this.evalExpression(expr.right, localVariables);
        return this.evalBinary(expr.operator, left, right);
      }
      case ExpressionType.FunctionCall:
        return this.evalFunctionCall(expr, localVariables);
      case ExpressionType.BuiltinCall: {
        return this.evalBuiltinFunctionCall(expr, localVariables);
      }
      case ExpressionType.TableDefinition:
        throw new Error("TableDefinition cannot be evaluated directly");
      case "Error":
        throw new Error(`ErrorCase: ${expr.message}`);
    }
  }

  private evalUnary(op: Operators, operand: BinaryNumber): BinaryNumber {
    switch (op) {
      case Operators.Not:
        return operand ? 0 : 1;
      default:
        throw new Error(`Unsupported unary operator: ${op}`);
    }
  }

  private evalBinary(
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

      case Operators.Equal:
        return left === right ? 1 : 0;
      case Operators.Nequal:
        return left !== right ? 1 : 0;

      case Operators.Imply:
        return !left || right ? 1 : 0;
      case Operators.Nimply:
        return left && !right ? 1 : 0;

      default:
        throw new Error(`Unsupported binary operator: ${op}`);
    }
  }

  private evalBuiltinFunctionCall(
    expr: Expression,
    parentLocalVar: Map<string, BinaryNumber>
  ): BinaryNumber {
    if (expr.type !== ExpressionType.BuiltinCall) {
      throw new Error(`Expected BuiltinCall, got ${expr.type}`);
    }

    switch (expr.name) {
      case BuiltinType.ToNand:
        return this.evalExpression(expr.operand, parentLocalVar);
      case BuiltinType.ToNor:
        return this.evalExpression(expr.operand, parentLocalVar);
      case BuiltinType.Simplify:
        return this.evalExpression(expr.operand, parentLocalVar);
      default:
        throw new Error(`Invalid usage of builtin function: ${expr.name}`);
    }
  }

  private evalFunctionCall(
    expr: Expression,
    parentLocalVar: Map<string, BinaryNumber>
  ): BinaryNumber {
    if (expr.type !== ExpressionType.FunctionCall) {
      throw new Error(`Expected FunctionCall, got ${expr.type}`);
    }
    if (!this.functions.has(expr.name)) {
      throw new Error(`Undefined function: ${expr.name}`);
    }
    const func = this.functions.get(expr.name)!;
    if (func.type !== StatementType.FunctionDefinition) {
      throw new Error(`Expected FunctionDefinition, got ${func.type}`);
    }

    const localVariables = new Map<string, BinaryNumber>();
    for (let i = 0; i < func.parameters.length; i++) {
      localVariables.set(
        func.parameters[i],
        this.evalExpression(expr.args[i], parentLocalVar)
      );
    }

    return this.evalExpression(func.expression, localVariables);
  }

  private convertTableToFunction(
    params: string[],
    expr: Expression
  ): Expression {
    if (expr.type !== ExpressionType.TableDefinition) {
      throw new Error(`Expected TableDefinition, got ${expr.type}`);
    }

    const minterms: Expression[] = [];

    for (const row of expr.rows) {
      if (row.output[0] === 1) {
        const terms: Expression[] = [];

        for (let i = 0; i < row.input[0].length; i++) {
          const bit = row.input[0][i].value;
          const variable: Expression = {
            type: ExpressionType.Variable,
            name: params[i],
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
  }
}

export { Interpreter };
