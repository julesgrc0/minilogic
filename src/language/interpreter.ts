import { Lexer, Operators } from "./lexer";
import {
  Statement,
  StatementType,
  Expression,
  ExpressionType,
  BinaryNumber,
  BuiltinType,
} from "./parser";

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

  public getVariables(): Map<string, BinaryNumber> {
    return this.variables;
  }

  public getFunctions(): Map<string, Statement> {
    return this.functions;
  }

  public callFunction(name: string, ...args: BinaryNumber[]): BinaryNumber | null {
    const func = this.functions.get(name);
    
    if (!func || func.type !== StatementType.FunctionDefinition) return null;
    if (func.parameters.length !== args.length) return null;

    const localVariables = new Map<string, BinaryNumber>();
    for (let i = 0; i < func.parameters.length; i++) {
      localVariables.set(func.parameters[i], args[i]);
    }

    return this.evalExpression(func.expression, localVariables);
  }

  public generateTruthTableFromFunction(funcName: string)  {
    const func = this.functions.get(funcName);
    if (!func || func.type != StatementType.FunctionDefinition) return null;

    return this.generateTruthTableFromExpression(
      func.parameters,
      func.expression
    );
  }

  public generateTruthTableFromExpression(variables: string[], expr: Expression): {
    inputs: string[];
    rows: [number[], number][];
  } | null {
    const inputs = variables;
    const rows: [number[], number][] = [];

    const combinations = this.getCombinations(inputs.length);
    for (const combination of combinations) {
      const scope = new Map<string, BinaryNumber>();
      inputs.forEach((input, i) => {
        scope.set(input, combination[i]);
      });
      const result = this.evalExpression(expr, scope);
      rows.push([combination, result]);
    }

    return { inputs, rows };
  }

  public getCombinations(n: number): BinaryNumber[][] {
    const result: BinaryNumber[][] = [];
    for (let i = 0; i < 1 << n; i++) {
      const row: BinaryNumber[] = [];
      for (let j = n - 1; j >= 0; j--) {
        row.push(((i >> j) & 1) as BinaryNumber);
      }
      result.push(row);
    }
    return result;
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
        for (const arg of stmt.args) {
          switch (arg.type) {
            case ExpressionType.Variable:
              if (this.functions.has(arg.name)) {
                const func = this.functions.get(arg.name)!;
                if (func.type !== StatementType.FunctionDefinition) continue;

                if(func.expression.type == ExpressionType.Number)
                {
                  this.output.push(
                    "Error: Cannot convert function " +  func.name + " to truth table because " + func.name + "(" + func.parameters.join(", ") + ") = " + func.expression.value + "\n"
                  );
                  continue;
                }

                this.output.push(
                  this.evalTableToString(func.expression, func.name)
                );
              } else {
                this.output.push(
                  "Error: Cannot convert " + arg.type + " to truth table\n"
                );
              }
              break;

            case ExpressionType.FunctionCall:
            case ExpressionType.BuiltinCall:
            case ExpressionType.UnaryExpression:
            case ExpressionType.BinaryExpression:
              this.output.push(this.evalTableToString(arg));
              break;
            case ExpressionType.Number:
            case ExpressionType.TableDefinition:
            case "Error":
              this.output.push(
                "Error: Cannot convert " + arg.type + " to table\n"
              );
              break;
          }
        }
        break;
      case BuiltinType.Export:
        // TODO: Implement export logic
        break;
      default:
        throw new Error(`Invalid usage of builtin function: ${stmt.name}`);
    }
  }

  private evalTableToString(
    expr: Expression,
    funcname: string | null = null
  ): string {
    const exclude = [
      ExpressionType.TableDefinition,
      ExpressionType.Number,
      ExpressionType.Variable,
      ExpressionType.FunctionCall,
      "Error",
    ];
    if (exclude.includes(expr.type)) {
      throw new Error(
        "Only logical expressions can be converted to a truth table"
      );
    }

    const variables = new Set<string>();
    const collectVariables = (e: Expression) => {
      if (e.type === ExpressionType.Variable) {
        if (!e.reference) {
          variables.add(e.name);
        }
      } else if (e.type === ExpressionType.BinaryExpression) {
        collectVariables(e.left);
        collectVariables(e.right);
      } else if (
        e.type === ExpressionType.UnaryExpression ||
        e.type === ExpressionType.BuiltinCall
      ) {
        collectVariables(e.operand);
      }
    };

    collectVariables(expr);

    const variableList = Array.from(variables);
    const numRows = Math.pow(2, variableList.length);
    const rows: string[] = [];

    const outputName =
      funcname || this.evalExpressionToString(expr, new Map(), true);
    rows.push(variableList.join(" ") + ` | ${outputName}`);

    for (let i = 0; i < numRows; i++) {
      const localVariables = new Map<string, BinaryNumber>();
      const binaryString = i.toString(2).padStart(variableList.length, "0");

      for (let j = 0; j < variableList.length; j++) {
        localVariables.set(
          variableList[j],
          parseInt(binaryString[j]) as BinaryNumber
        );
      }

      const result = this.evalExpression(expr, localVariables);
      const row = binaryString.split("").join(" ") + " | " + result;
      rows.push(row);
    }

    return rows.join("\n") + "\n";
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
        if (func.parameters.length !== expr.args.length) {
          throw new Error(
            `Function ${func.name} called with ${expr.args.length} arguments, expected ${func.parameters.length}`
          );
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

  private evalBuiltinFunctionCallToString(
    expr: Expression,
    replaceVar: Map<string, string>,
    allowall: boolean
  ): string {
    if (expr.type !== ExpressionType.BuiltinCall) {
      throw new Error(`Expected BuiltinCall, got ${expr.type}`);
    }

    switch (expr.name) {
      case BuiltinType.ToNand:
        return this.evalExpressionToString(
          this.convertExpressionToLogicGate(expr.operand, Operators.Nand),
          replaceVar,
          allowall
        );
      case BuiltinType.ToNor:
        return this.evalExpressionToString(
          this.convertExpressionToLogicGate(expr.operand, Operators.Nor),
          replaceVar,
          allowall
        );
      default:
        return this.evalExpressionToString(expr.operand, replaceVar, allowall);
    }
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
      case BuiltinType.ToNor:
        return this.evalExpression(expr.operand, parentLocalVar);
      case BuiltinType.Simplify:
        return this.evalExpression(expr.operand, parentLocalVar);
      default:
        throw new Error(`Invalid usage of builtin function: ${expr.name}`);
    }
  }

  private convertExpressionToLogicGate(
    expr: Expression,
    operator: Operators
  ): Expression {
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
        const inner = this.convertExpressionToLogicGate(expr.operand, operator);
        return logicGate(inner, inner);
      }

      case ExpressionType.BinaryExpression: {
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

      case ExpressionType.FunctionCall:
        return {
          ...expr,
          args: expr.args.map((arg) =>
            this.convertExpressionToLogicGate(arg, operator)
          ),
        };

      case ExpressionType.BuiltinCall:
        return {
          ...expr,
          operand: this.convertExpressionToLogicGate(expr.operand, operator),
        };
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
