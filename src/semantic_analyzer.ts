import { Statement, Expression, StatementType, ExpressionType, BuiltinType } from "./parser";

type SemanticError = {
    position: number;
    message: string;
}


class SemanticAnalyzer {
    private variables: Set<string> = new Set<string>();
    private functions: Record<string, number> = {};
    private errors: SemanticError[] = [];

    public constructor(private ast: Statement[]) { }

    private pushError(position: number, message: string): void {
        this.errors.push({ position, message });
    }

    private checkVariable(stmt: Statement): void {
        if (stmt.type !== StatementType.Assignment) return;

        let error = false;
        if (this.variables.has(stmt.variable)) {
            this.pushError(stmt.id, `Variable ${stmt.variable} already defined`);
            error = true;
        }
        if (this.functions.hasOwnProperty(stmt.variable)) {
            this.pushError(stmt.id, `Ambiguous variable name ${stmt.variable}, already used as function`);
            error = true;
        }

        this.checkExpression(stmt.expression, []);

        if (error) return;

        this.variables.add(stmt.variable);
    }

    private checkFunction(stmt: Statement): void {
        if (stmt.type !== StatementType.FunctionDefinition) return;

        let error = false;

        if (this.functions.hasOwnProperty(stmt.name)) {
            this.pushError(stmt.id, `Function ${stmt.name} already defined`);
            error = true;
        }
        if (this.variables.has(stmt.name)) {
            this.pushError(stmt.id, `Ambiguous function name ${stmt.name}, already used as variable`);
            error = true;
        }
        if (stmt.parameters.length === 0) {
            this.pushError(stmt.id, `Function ${stmt.name} has no parameters`);
            return;
        }

        this.checkExpression(stmt.expression, stmt.parameters);

        if (error) return;

        this.functions[stmt.name] = stmt.parameters.length;
    }

    private checkTableDefinition(expr: Expression, params: number): void {
        if (expr.type !== ExpressionType.TableDefinition) return;

        let values: Set<string> = new Set<string>();

        for (const row of expr.rows) {
            if (row.input[0].length !== params) {
                this.pushError(row.input[0][0].id, `Function table row has ${row.input[0].length} input columns, expected ${params}`);
            } else {
                const input = row.input[0].map(inp => inp.value).join("");
                if (values.has(input)) {
                    this.pushError(row.input[0][0].id, `Function table row has duplicate input "${input}"`);
                } else {
                    values.add(input);
                }
            }
            if (row.output.length !== 1) {
                this.pushError(expr.id, `Function table row must have 1 output column`);
            }
        }

        if (values.size !== Math.pow(2, params)) {
            this.pushError(expr.id, `Function table row has ${values.size} unique inputs, expected ${Math.pow(2, params)}`);
        }
    }


    private checkExpression(expr: Expression, allowvar: string[]): void {
        switch (expr.type) {
            case ExpressionType.BinaryExpression:
                this.checkExpression(expr.left, allowvar);
                this.checkExpression(expr.right, allowvar);
                break;
            case ExpressionType.UnaryExpression:
                this.checkExpression(expr.operand, allowvar);
                break;
            case ExpressionType.Variable:
                if (allowvar.length > 0) {
                    if (expr.reference && !this.variables.has(expr.name)) {
                        this.pushError(expr.id, `Variable reference ${expr.name} not found`);
                        return;
                    } else if (!expr.reference && !allowvar.includes(expr.name)) {
                        this.pushError(expr.id, `Variable ${expr.name} not defined`);
                    }
                } else {
                    if (expr.reference) {
                        this.pushError(expr.id, `Unexpected variable reference ${expr.name}*`);
                        return;
                    }

                    if (!this.variables.has(expr.name)) {
                        this.pushError(expr.id, `Variable ${expr.name} not defined`);
                    }
                }
                break;
            case ExpressionType.FunctionCall:
                if (!this.functions.hasOwnProperty(expr.name)) {
                    this.pushError(expr.id, `Function ${expr.name} not defined`);
                }
                else if (allowvar.length !== expr.args.length) {
                    this.pushError(expr.id, `Function ${expr.name} called with ${expr.args.length} arguments, expected ${this.functions[expr.name]}`);
                }

                for (const arg of expr.args) {
                    this.checkExpression(arg, allowvar);
                }
                break;
            case ExpressionType.TableDefinition:
                this.checkTableDefinition(expr, allowvar.length);
                break;
            case ExpressionType.Number:
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
                        this.checkExpression(arg, arg.args.map(arg => arg.type));
                    } else {
                        this.checkExpression(arg, []);
                    }
                }
                break;

            case BuiltinType.Graph:
                if (stmt.args.length !== 1) {
                    this.pushError(stmt.id, `Graph function must have 1 argument`);
                }
                break;
            case BuiltinType.Table:
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
            }
        }

        return this.errors;
    }
}

export { SemanticAnalyzer, SemanticError };