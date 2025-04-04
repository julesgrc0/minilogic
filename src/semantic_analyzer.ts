import { Lexer } from "./lexer";
import { Parser, Statement, Expression, StatementType, ExpressionType, BuiltinType } from "./parser";

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

        if (this.variables.has(stmt.variable)) {
            this.pushError(stmt.id, `Variable ${stmt.variable} already defined`);
            return;
        }

        this.checkExpression(stmt.expression, []);
        this.variables.add(stmt.variable);
    }

    private checkFunction(stmt: Statement): void {
        if (stmt.type !== StatementType.FunctionDefinition) return;

        if (this.functions.hasOwnProperty(stmt.name)) {
            this.pushError(stmt.id, `Function ${stmt.name} already defined`);
            return;
        }

        this.checkExpression(stmt.expression, stmt.parameters);
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
                    }

                    if (!allowvar.includes(expr.name)) {
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

        switch(stmt.name)
        {
            case BuiltinType.Show:
            case BuiltinType.Print:
                for (const arg of stmt.args) {
                    this.checkExpression(arg, []);
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


const main = () => {

    const program = `
          A = not not not not not B
          A = 1 or A and 0
          B = 0 and C*
          B = (B and C) or (C and B) and C*

          F(x, y) = x or z and G(not J)

          X = F(A, B or B, C)

          Y(A, B) = [
            001, 1
            11, 1
            11, 0
          ]

          PRINT(A or B and C, Y(0, 1))
          GRAPH(F, B)
      `;

    const lexer = new Lexer(program);

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

    console.log("Found errors: ", errors.length);

    for (const error of errors) {
        const token = lexer.getTokenById(error.position);

        console.error(`Error at position ${error.position} (${token?.value} ${token?.type}):  ${error.message}`);
    }
}

main()