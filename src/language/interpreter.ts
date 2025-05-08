import { Solve } from "./builtin/solve";
import { BinaryNumber, Keywords, Operators } from "./lexer";
import { Expression, ExpressionType, Statement, StatementType } from "./parser";
import {
  getCombinations,
  getVariablesInExpression,
  maxPosition,
  minPosition,
  RANGE_NOT_SET,
} from "./utils";

type MLCVariable = Record<string, BinaryNumber>;
type MLCFunction = Record<string, Statement & { type: StatementType.Function }>;

class Interpreter {
  public variables: MLCVariable = {};
  public functions: MLCFunction = {};
  private output: string[] = [];

  public constructor(
    private program: Statement[],
    private inputFunction: (message: string) => Promise<BinaryNumber>,
  ) {}

  public async execute(): Promise<string[]> {
    for (const stmt of this.program) {
      switch (stmt.type) {
        case StatementType.Variable:
          {
            if (this.variables.hasOwnProperty(stmt.name)) {
              throw new Error(`Variable ${stmt.name} already defined`);
            }
            this.variables[stmt.name] = await this.evalExpression(stmt.value);
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
        case StatementType.FunctionTable:
          {
            if (this.functions.hasOwnProperty(stmt.name)) {
              throw new Error(`Function ${stmt.name} already defined`);
            }
            this.functions[stmt.name] =
              this.convertFunctionTableToFunction(stmt);
          }
          break;
        case StatementType.BuiltinCall:
          await this.evalBuiltinStatement(stmt);
          break;
      }
    }
    return this.output;
  }

  private async evalBuiltinStatement(stmt: Statement): Promise<void> {
    if (stmt.type !== StatementType.BuiltinCall) {
      throw new Error(`Unexpected statement type: ${stmt.type}`);
    }

    switch (stmt.name) {
      case Keywords.Print:
        {
          const promises = stmt.parameters.map(async (param) => {
            if (param.type == ExpressionType.String) {
              return param.value;
            }
            return (await this.evalExpression(param)).toString();
          });
          const resolvedValues = await Promise.all(promises);

          this.output.push(resolvedValues.join(" "));
          this.output.push("");
        }
        break;
      case Keywords.Show:
        {
          const promises = stmt.parameters.map(
            async (param) => await this.showExpression(param, true),
          );
          const resolvedValues = await Promise.all(promises);
          this.output.push(resolvedValues.join(" "));
        }
        break;
      case Keywords.Table:
        {
          const promises = stmt.parameters.map(
            async (param) => await this.showTruthTable(param),
          );
          const resolvedValues = await Promise.all(promises);

          this.output.push(resolvedValues.join(" "));
          this.output.push("");
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

  private async evalBuiltinExpression(expr: Expression): Promise<Expression> {
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
      case Keywords.Input: {
        if (expr.parameters.length !== 1)
          throw new Error(
            `Input expects 1 parameter, got ${expr.parameters.length}`,
          );
        if (expr.parameters[0].type !== ExpressionType.String)
          throw new Error(
            `Input expects a string, got ${expr.parameters[0].type}`,
          );

        const message = expr.parameters[0].value;

        try {
          return {
            type: ExpressionType.Number,
            value: await this.inputFunction(message),
            range: RANGE_NOT_SET,
          };
        } catch {
          throw new Error("Unable to create readline interface");
        }
      }
      default:
        throw new Error(`Unexpected builtin expression: ${expr.name}`);
    }
  }

  private evalUnaryExpression(
    op: Operators,
    operand: BinaryNumber,
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
    right: BinaryNumber,
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
    localVariables: MLCVariable,
  ): BinaryNumber {
    if (expr.type !== ExpressionType.Variable) {
      throw new Error(`Unexpected expression type: ${expr.type}`);
    }

    if (localVariables.hasOwnProperty(expr.name) && !expr.reference) {
      return localVariables[expr.name];
    }

    if (!this.variables.hasOwnProperty(expr.name)) {
      throw new Error(`Variable ${expr.name} not defined`);
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

  private async evalFunctionExpression(
    expr: Expression,
    parentLocalVariables: MLCVariable,
  ): Promise<BinaryNumber> {
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
        `Function ${func.name} expects ${func.parameters.length} parameters, got ${expr.parameters.length}`,
      );
    }

    const localVariables: MLCVariable = {};
    for (let i = 0; i < func.parameters.length; i++) {
      localVariables[func.parameters[i]] = await this.evalExpression(
        expr.parameters[i],
        parentLocalVariables,
      );
    }

    return await this.evalExpression(func.body, localVariables);
  }

  private async evalExpression(
    expr: Expression,
    localVariables: MLCVariable = {},
  ): Promise<BinaryNumber> {
    switch (expr.type) {
      case ExpressionType.Number:
        return expr.value;
      case ExpressionType.Variable:
        return this.evalVariableExpression(expr, localVariables);
      case ExpressionType.FunctionCall:
        return await this.evalFunctionExpression(expr, localVariables);
      case ExpressionType.Binary: {
        const left = await this.evalExpression(expr.left, localVariables);
        const right = await this.evalExpression(expr.right, localVariables);
        return this.evalBinaryExpression(expr.operator, left, right);
      }
      case ExpressionType.Unary: {
        const operand = await this.evalExpression(expr.operand, localVariables);
        return this.evalUnaryExpression(expr.operator, operand);
      }
      case ExpressionType.BuiltinCall:
        return await this.evalExpression(
          await this.evalBuiltinExpression(expr),
          localVariables,
        );
      default:
        throw new Error("Unexpected expression type");
    }
  }

  private async showBuiltinExpression(
    expr: Expression & {
      type: ExpressionType.BuiltinCall;
    },
  ): Promise<string> {
    switch (expr.name) {
      case Keywords.ToNand:
        return this.showExpression(
          this.convertExpressionToLogicGate(expr, Operators.Nand),
        );
      case Keywords.ToNor:
        return this.showExpression(
          this.convertExpressionToLogicGate(expr, Operators.Nor),
        );
      case Keywords.SolvePOS:
      case Keywords.SolveSOP: {
        const targetexpr = expr.parameters[0];

        const minterms = (await this.getMinMaxterms(targetexpr)).min.map((t) =>
          t.join(""),
        );
        const solver = new Solve(
          getVariablesInExpression(targetexpr),
          minterms,
        );

        const result = expr; //solver.solve();
        if (expr.name === Keywords.SolvePOS) {
          return this.showExpression(result, true);
        } else {
          return this.showExpression(
            await this.convertExpressionToSOP(result),
            true,
          );
        }
      }

      default:
        throw new Error(`Unexpected builtin expression: ${expr.name}`);
    }
  }

  private async getMinMaxterms(expr: Expression) {
    const variables = getVariablesInExpression(expr);
    const cmbs = getCombinations(variables.length);

    const minterms: BinaryNumber[][] = [];
    const maxterms: BinaryNumber[][] = [];

    for (const cmb of cmbs) {
      const localVariables: MLCVariable = {};
      variables.forEach((variable, i) => {
        localVariables[variable] = cmb[i];
      });

      const result = await this.evalExpression(expr, localVariables);
      if (result) {
        minterms.push(cmb);
      } else {
        maxterms.push(cmb);
      }
    }
    return { min: minterms, max: maxterms };
  }

  public async getTruthTable(expr: Expression): Promise<string[][]> {
    const header = ["", await this.showExpression(expr)];

    const localVariables: MLCVariable = {};
    for (const variable of getVariablesInExpression(expr)) {
      localVariables[variable] = 0;
    }
    header[0] = Object.keys(localVariables).join(" | ");

    const cmbs = getCombinations(Object.keys(localVariables).length);

    const rows: string[][] = [];
    for (const cmb of cmbs) {
      Object.keys(localVariables).forEach((key, i) => {
        localVariables[key] = cmb[i];
      });
      rows.push([
        cmb.join(""),
        (await this.evalExpression(expr, localVariables)).toString(),
      ]);
    }

    return [header, ...rows];
  }

  public async showTruthTable(expr: Expression | string[][]): Promise<string> {
    const table: string[][] = Array.isArray(expr)
      ? expr
      : await this.getTruthTable(expr);

    const colCount = table[0].length;
    const colWidths = Array(colCount).fill(0);

    for (const row of table) {
      row.forEach((cell, i) => {
        colWidths[i] = Math.max(colWidths[i], cell.toString().length);
      });
    }

    const formatRow = (row: string[]) =>
      "| " +
      row.map((cell, i) => cell.toString().padEnd(colWidths[i])).join(" | ") +
      " |";

    const separatorRow =
      "| " + colWidths.map((w) => "-".repeat(w)).join(" | ") + " |";

    const bottomLine = separatorRow
      .split("")
      .map((_) => "-")
      .join("");

    const [header, ...body] = table;
    const formattedRows = [
      formatRow(header),
      separatorRow,
      ...body.map(formatRow),
      bottomLine,
    ];

    return formattedRows.join("\n");
  }

  public async showExpression(
    expr: Expression,
    inlineFunctions: boolean = false,
    replace: Record<string, string> = {},
  ): Promise<string> {
    switch (expr.type) {
      case ExpressionType.String:
      case ExpressionType.Number:
        return expr.value.toString();
      case ExpressionType.Variable: {
        if (replace.hasOwnProperty(expr.name) && !expr.reference) {
          return replace[expr.name];
        }
        const value =
          expr.reference && this.variables.hasOwnProperty(expr.name)
            ? `* = ${this.variables[expr.name]}`
            : "";
        return expr.name + value;
      }
      case ExpressionType.FunctionCall: {
        const paramPromises = expr.parameters.map(
          async (param) =>
            await this.showExpression(param, inlineFunctions, replace),
        );
        let params = await Promise.all(paramPromises);

        const str = `${expr.name}(${params.join(", ")})`;
        if (inlineFunctions) {
          const func = this.functions[expr.name];
          if (!func) throw new Error(`Function ${expr.name} not defined`);

          const newReplace: Record<string, string> = {};
          if (params.length !== func.parameters.length) {
            params = func.parameters;
          }
          func.parameters.forEach((param, i) => {
            newReplace[param] = params[i];
          });
          return (
            str +
            " = " +
            (await this.showExpression(func.body, true, newReplace))
          );
        }
        return str;
      }
      case ExpressionType.Binary:
        return `(${await this.showExpression(expr.left, inlineFunctions, replace)} ${
          expr.operator
        } ${await this.showExpression(expr.right, inlineFunctions, replace)})`;
      case ExpressionType.Unary:
        return `${expr.operator} ${await this.showExpression(
          expr.operand,
          inlineFunctions,
          replace,
        )}`;
      case ExpressionType.BuiltinCall: {
        switch (expr.name) {
          case Keywords.ToNand:
          case Keywords.ToNor:
          case Keywords.SolvePOS:
          case Keywords.SolveSOP:
            const paramPromises = expr.parameters.map(
              async (param) =>
                await this.showExpression(param, inlineFunctions, replace),
            );
            const params = await Promise.all(paramPromises);
            return `<${expr.name}>(${params.join(
              ", ",
            )}) = ${await this.showBuiltinExpression(expr)}`;
          case Keywords.Input:
          case Keywords.Input:
            if (
              expr.parameters.length !== 1 &&
              expr.parameters[0].type !== ExpressionType.String
            ) {
              throw new Error("Input expects a string parameter");
            }
            return `INPUT("${(expr.parameters[0] as any).value}")`;
          default:
            throw new Error(`Unexpected builtin expression: ${expr.name}`);
        }
      }
      case ExpressionType.Error:
        throw new Error(expr.message);
    }
  }

  public convertFunctionTableToFunction(
    stmt: Statement & { type: StatementType.FunctionTable },
  ): Statement & { type: StatementType.Function } {
    const minterms: Expression[] = [];

    for (const row of stmt.table) {
      const terms: Expression[] = [];

      for (let i = 0; i < row.index.value.length; i++) {
        const variable: Expression = {
          type: ExpressionType.Variable,
          name: stmt.parameters[i],
          reference: false,
          range: RANGE_NOT_SET,
        };

        terms.push({
          type: ExpressionType.Binary,
          operator: Operators.And,
          left:
            row.index.value[i] === 1
              ? variable
              : {
                  type: ExpressionType.Unary,
                  operator: Operators.Not,
                  operand: variable,
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
        })),
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
      parameters: [...stmt.parameters, ...stmt.subparameters],
      body,
      range: RANGE_NOT_SET,
    };
  }

  public convertExpressionToLogicGate(
    expr: Expression,
    operator: Operators.Nand | Operators.Nor,
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
                logicGate(right, right),
              );
              return logicGate(a, a);
            }
            return expr;

          case Operators.Nor:
            if (operator == Operators.Nand) {
              const a = logicGate(
                logicGate(left, left),
                logicGate(right, right),
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
            this.convertExpressionToLogicGate(arg, operator),
          ),
        };
      default:
        return expr;
    }
  }

  public async convertExpressionToSOP(expr: Expression): Promise<Expression> {
    const variables = getVariablesInExpression(expr);
    const minterms = (await this.getMinMaxterms(expr)).min;

    const sopTerms: Expression[] = minterms.map((minterm) => {
      const terms: Expression[] = minterm.map((bit, index) => {
        return bit
          ? {
              type: ExpressionType.Variable,
              name: variables[index],
              reference: false,
              range: RANGE_NOT_SET,
            }
          : {
              type: ExpressionType.Unary,
              operator: Operators.Not,
              operand: {
                type: ExpressionType.Variable,
                name: variables[index],
                reference: false,
                range: RANGE_NOT_SET,
              },
              range: RANGE_NOT_SET,
            };
      });

      return terms.reduce((acc, term) => ({
        type: ExpressionType.Binary,
        operator: Operators.And,
        left: acc,
        right: term,
        range: RANGE_NOT_SET,
      }));
    });

    return sopTerms.length === 0
      ? { type: ExpressionType.Number, value: 0, range: RANGE_NOT_SET }
      : sopTerms.reduce((acc, term) => ({
          type: ExpressionType.Binary,
          operator: Operators.Or,
          left: acc,
          right: term,
          range: RANGE_NOT_SET,
        }));
  }

  public async convertExpressionToPOS(expr: Expression): Promise<Expression> {
    const variables = getVariablesInExpression(expr);
    const maxterms = (await this.getMinMaxterms(expr)).max;

    const posTerms: Expression[] = maxterms.map((maxterm) => {
      const terms: Expression[] = maxterm.map((bit, index) => {
        return bit
          ? {
              type: ExpressionType.Unary,
              operator: Operators.Not,
              operand: {
                type: ExpressionType.Variable,
                name: variables[index],
                reference: false,
                range: RANGE_NOT_SET,
              },
              range: RANGE_NOT_SET,
            }
          : {
              type: ExpressionType.Variable,
              name: variables[index],
              reference: false,
              range: RANGE_NOT_SET,
            };
      });

      return terms.reduce((acc, term) => ({
        type: ExpressionType.Binary,
        operator: Operators.Or,
        left: acc,
        right: term,
        range: RANGE_NOT_SET,
      }));
    });

    return posTerms.length === 0
      ? { type: ExpressionType.Number, value: 1, range: RANGE_NOT_SET }
      : posTerms.reduce((acc, term) => ({
          type: ExpressionType.Binary,
          operator: Operators.And,
          left: acc,
          right: term,
          range: RANGE_NOT_SET,
        }));
  }
}

export { Interpreter };
