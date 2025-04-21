import {
  Statement,
  Expression,
  StatementType,
  ExpressionType,
  BuiltinType,
  builtinFunctions,
  TableRow,
  BinaryNumber,
} from "./parser";
import {
  getCombinations,
  getExpressionToString,
  getStatmentToString,
  QuickFixStatement,
  QuickFixType,
} from "./utils";

type SemanticError = {
  position: number;
  message: string;
  fixId: number;
};

class SemanticAnalyzer {
  private variables: Set<string> = new Set<string>();
  private functions: Record<string, number> = {};
  private errors: SemanticError[] = [];
  private fixes: QuickFixStatement[] = [];

  public constructor(private ast: Statement[]) {}

  private pushError(
    position: number,
    message: string,
    fix: QuickFixStatement
  ): void {
    this.fixes[fix.fixId] = fix;
    this.errors.push({ position, message, fixId: fix.fixId });
  }

  public getFix(id: number): QuickFixStatement | null {
    return this.fixes[id] || null;
  }

  private proposeName(name: string, check: (name: string) => boolean): string {
    let i = 1;
    let output = name + "_" + i;
    while (check(output)) {
      i++;
      output = name + "_" + i;
    }
    return output;
  }

  private searchNearName(name: string, names: string[]): string | null {
    for (const n of names) {
      if (n.startsWith(name) || n.endsWith(name)) {
        return n;
      }
    }
    return null;
  }

  private checkVariable(stmt: Statement): void {
    if (stmt.type !== StatementType.Assignment) return;

    if (
      this.variables.has(stmt.variable) ||
      this.functions.hasOwnProperty(stmt.variable)
    ) {
      const newVarName = this.proposeName(stmt.variable, (name) =>
        this.variables.has(name)
      );

      const errorMessage = this.functions.hasOwnProperty(stmt.variable)
        ? `Ambiguous variable name ${stmt.variable}, already used as function`
        : `Variable ${stmt.variable} already defined`;
      this.pushError(stmt.id, errorMessage, {
        type: QuickFixType.CHANGE,
        message: `Rename variable ${stmt.variable} to ${newVarName}`,
        line: getStatmentToString({ ...stmt, variable: newVarName }),
        fixId: stmt.id,
      });

      this.checkExpression(stmt.expression, []);
      return;
    }

    this.checkExpression(stmt.expression, []);
    this.variables.add(stmt.variable);
  }

  private checkFunction(stmt: Statement): void {
    if (stmt.type !== StatementType.FunctionDefinition) return;

    let error = false;

    if (
      this.functions.hasOwnProperty(stmt.name) ||
      this.variables.has(stmt.name)
    ) {
      const newFuncName = this.proposeName(stmt.name, (name) =>
        this.functions.hasOwnProperty(name)
      );

      const errorMessage = this.functions.hasOwnProperty(stmt.name)
        ? `Ambiguous function name ${stmt.name}, already used as variable`
        : `Function ${stmt.name} already defined`;
      this.pushError(stmt.id, errorMessage, {
        type: QuickFixType.CHANGE,
        message: `Rename function ${stmt.name} to ${newFuncName}`,
        line: getStatmentToString({ ...stmt, name: newFuncName }),
        fixId: stmt.id,
      });
      error = true;
    }

    if (stmt.parameters.length === 0) {
      this.pushError(stmt.id, `Function ${stmt.name} has no parameters`, {
        type: QuickFixType.CHANGE,
        message: `Add parameters to function ${stmt.name}`,
        line: getStatmentToString({ ...stmt, parameters: ["A"] }),
        fixId: stmt.id,
      });
      return;
    }

    const params = new Set<string>();
    for (const param of stmt.parameters) {
      if (params.has(param)) {
        this.pushError(
          stmt.id,
          `Duplicate parameter ${param} in function ${stmt.name}`,
          {
            type: QuickFixType.CHANGE,
            message: `Rename parameter ${param} to ${this.proposeName(
              param,
              (name) => stmt.parameters.includes(name)
            )}`,
            line: getStatmentToString({
              ...stmt,
              parameters: [
                ...stmt.parameters.filter((p) => p !== param),
                this.proposeName(param, (name) =>
                  stmt.parameters.includes(name)
                ),
              ],
            }),
            fixId: stmt.id,
          }
        );
        error = true;
      } else {
        params.add(param);
      }
    }

    this.checkExpression(stmt.expression, stmt.parameters);

    if (error) return;

    this.functions[stmt.name] = stmt.parameters.length;
  }

  private checkTableDefinition(expr: Expression, params: number): void {
    if (expr.type !== ExpressionType.TableDefinition) return;

    let values: Set<string> = new Set<string>();

    const newRows: TableRow[] = getCombinations(params).map((cmb) => {
      return {
        input: [cmb.map((x) => ({ value: x as BinaryNumber, id: -1 }))],
        output: cmb.map((x) => 0 as BinaryNumber),
      };
    });
    const fix = {
      type: QuickFixType.CHANGE,
      message: `Change number of input columns to ${params}`,
      line: {
        value: getExpressionToString({
          ...expr,
          rows: newRows,
        }),
        at: expr.id,
      },
      fixId: expr.id,
    };
    for (const row of expr.rows) {
      if (row.input[0].length !== params) {
        this.pushError(
          row.input[0][0].id,
          `Function table row has ${row.input[0].length} input columns, expected ${params}`,
          fix
        );
      } else {
        const input = row.input[0].map((inp) => inp.value).join("");
        if (values.has(input)) {
          this.pushError(
            row.input[0][0].id,
            `Function table row has duplicate input "${input}"`,
            fix
          );
        } else {
          values.add(input);
        }
      }
      if (row.output.length !== 1) {
        this.pushError(
          expr.id,
          `Function table row must have 1 output column`,
          fix
        );
      }
    }

    if (values.size !== Math.pow(2, params)) {
      this.pushError(
        expr.id,
        `Function table row has ${
          values.size
        } unique inputs, expected ${Math.pow(2, params)}`,
        fix
      );
    }
  }

  private checkExpression(
    expr: Expression,
    allowvar: string[] | number,
    allowall: boolean = false
  ): void {
    switch (expr.type) {
      case ExpressionType.BinaryExpression:
        this.checkExpression(expr.left, allowvar, allowall);
        this.checkExpression(expr.right, allowvar, allowall);
        break;
      case ExpressionType.BuiltinCall:
        if (!builtinFunctions.includes(expr.name)) {
          this.pushError(
            expr.id,
            `Invalid usage of builtin function ${expr.name}, can't be used in expressions`,
            {
              type: QuickFixType.REMOVE,
              message: `Remove builtin function ${expr.name} from expression`,
              fixId: expr.id,
            }
          );
          return;
        }
        this.checkExpression(expr.operand, allowvar, allowall);
      case ExpressionType.UnaryExpression:
        this.checkExpression(expr.operand, allowvar, allowall);
        break;
      case ExpressionType.Variable:
        if (allowall) return;

        if (typeof allowvar != "number" && allowvar.length > 0) {
          const nearName = this.searchNearName(expr.name, [...this.variables]);
          const fix: QuickFixStatement =
            nearName == null
              ? {
                  type: QuickFixType.REMOVE,
                  message: `Remove variable ${expr.name}`,
                  fixId: expr.id,
                }
              : {
                  type: QuickFixType.CHANGE,
                  message: `Change variable ${expr.name} to ${nearName}`,
                  line: {
                    value: getExpressionToString({
                      ...expr,
                      name: nearName,
                    }),
                    at: expr.id,
                  },
                  fixId: expr.id,
                };

          if (expr.reference && !this.variables.has(expr.name)) {
            this.pushError(
              expr.id,
              `Variable reference ${expr.name} not found`,
              fix
            );
            return;
          } else if (!expr.reference && !allowvar.includes(expr.name)) {
            this.pushError(expr.id, `Variable ${expr.name} not defined`, fix);
          }
        } else {
          if (expr.reference) {
            this.pushError(
              expr.id,
              `Unexpected variable reference ${expr.name}*`,
              {
                type: QuickFixType.CHANGE,
                message: `Remove reference from variable ${expr.name}`,
                line: {
                  value: getExpressionToString({
                    ...expr,
                    reference: false,
                  }),
                  at: expr.id,
                },
                fixId: expr.id,
              }
            );
            return;
          }

          if (!this.variables.has(expr.name)) {
            const nearName = this.searchNearName(expr.name, [
              ...this.variables,
            ]);
            const fix: QuickFixStatement =
              nearName == null
                ? {
                    type: QuickFixType.REMOVE,
                    message: `Remove variable ${expr.name}`,
                    fixId: expr.id,
                  }
                : {
                    type: QuickFixType.CHANGE,
                    message: `Change variable ${expr.name} to ${nearName}`,
                    line: {
                      value: getExpressionToString({
                        ...expr,
                        name: nearName,
                      }),
                      at: expr.id,
                    },
                    fixId: expr.id,
                  };
            this.pushError(expr.id, `Variable ${expr.name} not defined`, fix);
          }
        }
        break;
      case ExpressionType.FunctionCall:
        if (allowall) return;

        if (!this.functions.hasOwnProperty(expr.name)) {
          const nearName = this.searchNearName(
            expr.name,
            Object.keys(this.functions)
          );
          const fix: QuickFixStatement =
            nearName == null
              ? {
                  type: QuickFixType.REMOVE,
                  message: `Remove function ${expr.name}`,
                  fixId: expr.id,
                }
              : {
                  type: QuickFixType.CHANGE,
                  message: `Change function ${expr.name} to ${nearName}`,
                  line: {
                    value: getExpressionToString({
                      ...expr,
                      name: nearName,
                    }),
                    at: expr.id,
                  },
                  fixId: expr.id,
                };
          this.pushError(expr.id, `Function ${expr.name} not defined`, fix);
        } else if (this.functions[expr.name] !== expr.args.length) {
          this.pushError(
            expr.id,
            `Function ${expr.name} called with ${
              expr.args.length
            } arguments, expected ${this.functions[expr.name]}`,
            {
              type: QuickFixType.NONE,
              message: "",
              fixId: expr.id,
            }
          );
        }

        for (const arg of expr.args) {
          this.checkExpression(arg, allowvar, allowall);
        }
        break;
      case ExpressionType.TableDefinition:
        if (typeof allowvar == "number") {
          this.pushError(expr.id, `Table definition has no parameters`, {
            type: QuickFixType.REMOVE,
            message: `Remove table definition`,
            fixId: expr.id,
          });
          return;
        }
        this.checkTableDefinition(expr, allowvar.length);
        break;
      case ExpressionType.Number:
        break;
      case "Error":
        this.pushError(expr.id, expr.message, {
          type: QuickFixType.NONE,
          message: "",
          fixId: expr.id,
        });
        break;
    }
  }

  private checkBuiltin(stmt: Statement): void {
    if (stmt.type !== StatementType.BuiltinCall) return;

    switch (stmt.name) {
      case BuiltinType.Show:
      case BuiltinType.Print:
        for (const arg of stmt.args) {
          if (arg.type === ExpressionType.FunctionCall) {
            this.checkExpression(
              arg,
              arg.args.length,
              stmt.name === BuiltinType.Show
            );
          } else {
            this.checkExpression(arg, [], stmt.name === BuiltinType.Show);
          }
        }
        break;

      case BuiltinType.Graph:
        if (stmt.args.length !== 1) {
          this.pushError(stmt.id, `Graph function must have 1 argument`, {
            type: QuickFixType.NONE,
            message: "",
            fixId: stmt.id,
          });
        }
        break;

      case BuiltinType.Table:
        for (const arg of stmt.args) {
          switch (arg.type) {
            case ExpressionType.TableDefinition:
            case ExpressionType.Number:
            case "Error":
              this.pushError(
                arg.id,
                "Table function does not accept " + arg.type.toLowerCase(),
                {
                  type: QuickFixType.NONE,
                  message: "",
                  fixId: stmt.id,
                }
              );
              break;
            case ExpressionType.Variable:
              if (
                !(!arg.reference && this.functions.hasOwnProperty(arg.name))
              ) {
                this.pushError(
                  arg.id,
                  "Table function does not accept " + arg.type.toLowerCase(),
                  {
                    type: QuickFixType.NONE,
                    message: "",
                    fixId: stmt.id,
                  }
                );
              }
              break;
          }
        }
        break;
      case BuiltinType.Export:
        break;
      case BuiltinType.Simplify:
      case BuiltinType.ToNand:
      case BuiltinType.ToNor:
        if (stmt.args.length !== 1) {
          this.pushError(
            stmt.id,
            `Builtin function ${stmt.name} must have 1 argument`,
            {
              type: QuickFixType.NONE,
              message: "",
              fixId: stmt.id,
            }
          );
        }
        this.pushError(
          stmt.id,
          `Invalid usage of builtin function ${stmt.name}, can't be used in statements`,
          {
            type: QuickFixType.REMOVE,
            message: `Remove builtin function ${stmt.name} from statement`,
            fixId: stmt.id,
          }
        );
        break;
    }
  }

  public analyze(): SemanticError[] {
    for (const stmt of this.ast) {
      switch (stmt.type) {
        case StatementType.Assignment:
          this.checkVariable(stmt);
          break;
        case StatementType.FunctionDefinition:
          this.checkFunction(stmt);
          break;
        case StatementType.BuiltinCall:
          this.checkBuiltin(stmt);
          break;
        case "Error":
          this.pushError(stmt.id, stmt.message, {
            type: QuickFixType.NONE,
            message: "",
            fixId: stmt.id,
          });
          break;
      }
    }

    return this.errors;
  }
}

export { SemanticAnalyzer, SemanticError };
