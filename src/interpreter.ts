import { Lexer, Operators } from "./lexer";
import { Statement, StatementType, Expression, ExpressionType, BinaryNumber, Parser, BuiltinType } from "./parser";
import { SemanticAnalyzer } from "./semantic_analyzer";

class Interpreter {
    private variables = new Map<string, BinaryNumber>();
    private functions = new Map<string, Statement>();
    private output: string[] = [];

    constructor(private ast: Statement[]) { }

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
            throw new Error(`Ambiguous variable name ${stmt.variable}, already used as function`);
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
            throw new Error(`Ambiguous function name ${stmt.name}, already used as variable`);
        }

        if(stmt.expression.type === ExpressionType.TableDefinition)
        {
            this.functions.set(stmt.name, {
                ...stmt,
                expression:  this.convertTableToFunction(stmt.parameters, stmt.expression)
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
                const argsPrint = stmt.args.map(arg => this.evalExpression(arg));
                this.output.push(argsPrint.join(", "));
                break;

            case BuiltinType.Show:
                const argsShow = stmt.args.map(arg => this.evalExpressionToString(arg));
                this.output.push(argsShow.join(", "));
                break;
            case BuiltinType.Graph:
                // TODO: Implement graphing logic
                break;
            case BuiltinType.Table:
                // TODO: Implement table logic
                break;
        }
    }

    private evalExpression(expr: Expression, localVariables: Map<string, BinaryNumber> = new Map()): BinaryNumber {
        switch (expr.type) {
            case ExpressionType.Number:
                return expr.value;
            case ExpressionType.Variable:
            
                if(localVariables.size > 0) {
                    if(expr.reference && !this.variables.has(expr.name)) {
                        throw new Error(`Undefined variable reference: ${expr.name}`);
                    }
                    if(!expr.reference && !localVariables.has(expr.name)) {
                        throw new Error(`Undefined variable: ${expr.name}`);
                    }

                    return expr.reference ? this.variables.get(expr.name)! : localVariables.get(expr.name)!;
                }else{
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
                return this.evalFunctionCall(expr);
            case ExpressionType.TableDefinition:
                throw new Error("TableDefinition cannot be evaluated directly");
        }
    }

    private evalExpressionToString(expr: Expression): string {
        switch (expr.type) {
            case ExpressionType.Number:
                return expr.value.toString();
            case ExpressionType.Variable:
                if (!this.variables.has(expr.name)) {
                    throw new Error(`Undefined variable: ${expr.name}`);
                }
                return expr.name;
            case ExpressionType.UnaryExpression: {
                const operand = this.evalExpressionToString(expr.operand);
                return `${expr.operator}(${operand})`;
            }
            case ExpressionType.BinaryExpression: {
                const left = this.evalExpressionToString(expr.left);
                const right = this.evalExpressionToString(expr.right);
                return `(${left} ${expr.operator} ${right})`;
            }
            case ExpressionType.FunctionCall:
                return `${expr.name}(${expr.args.map(arg => this.evalExpressionToString(arg)).join(", ")})`;
            case ExpressionType.TableDefinition:
                throw new Error("TableDefinition cannot be evaluated directly");
        }
    }

    private evalUnary(op: Operators, operand: BinaryNumber): BinaryNumber {
        switch (op) {
            case Operators.Not: return operand ? 0 : 1;
            default:
                throw new Error(`Unsupported unary operator: ${op}`);
        }
    }

    private evalBinary(op: Operators, left: BinaryNumber, right: BinaryNumber): BinaryNumber {
        switch (op) {
            case Operators.And: return left && right;
            case Operators.Or: return left || right;
            case Operators.Xor: return (left ^ right) as BinaryNumber;

            case Operators.Nor: return (left || right) ? 0 : 1;
            case Operators.Nand: return (left && right) ? 0 : 1;
            case Operators.Xnor: return (left ^ right) ? 0 : 1;

            case Operators.Equal: return left === right ? 1 : 0;
            case Operators.Nequal: return left !== right ? 1 : 0;

            case Operators.Imply: return left && (right ? 1 : 0);
            case Operators.Nimply: return (left && (right ? 0 : 1)) ? 0 : 1;

            default:
                throw new Error(`Unsupported binary operator: ${op}`);
        }
    }

    private evalFunctionCall(expr: Expression): BinaryNumber {
        if (expr.type !== ExpressionType.FunctionCall) {
            throw new Error(`Expected FunctionCall, got ${expr.type}`);
        }
        if (!this.functions.has(expr.name)) {
            throw new Error(`Undefined function: ${expr.name}`);
        }
        const func = this.functions.get(expr.name)!;
        if(func.type !== StatementType.FunctionDefinition) {
            throw new Error(`Expected FunctionDefinition, got ${func.type}`);
        }
        
        const localVariables = new Map<string, BinaryNumber>();
        for(let i = 0; i < func.parameters.length; i++) {
            localVariables.set(func.parameters[i], this.evalExpression(expr.args[i]));
        }
        return this.evalExpression(func.expression, localVariables);
    }

    private convertTableToFunction(params: string[], expr: Expression): Expression {
        if (expr.type !== ExpressionType.TableDefinition) {
            throw new Error(`Expected TableDefinition, got ${expr.type}`);
        }

        const values: Set<string> = new Set();
        for (const row of expr.rows) {
            if (row.output[0] == 1) {
                values.add(row.input[0].map(inp => inp.value).join(""))
            }
        }
        console.log("Values: ", values);
        return expr;
    }
}



const main = () => {

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
    const program = `
        B = (1 or 0) and 1
        PRINT(B)

        F(A) = A and B*
        PRINT(F(1))
        PRINT(F(0)) 
        `

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

    if (errors.length > 0) {
        for (const error of errors) {
            const token = lexer.getTokenById(error.position);

            console.error(`Error at position ${error.position} (${token?.value} ${token?.type}):  ${error.message}`);
        }
    } else {
        const interpreter = new Interpreter(ast);
        const output = interpreter.run();
        console.log(output.join("\n"));
    }
}

main()