import { Expression, ExpressionType } from "./parser";
import { BinaryNumber, Keywords, Lexer, Position } from "./lexer";
import { Parser, Statement, StatementType } from "./parser";

type SemanticError = {
  message: string;
  range: {
    start: Position;
    end: Position;
  };
};

class SemanticAnalyzer {
  private variables: Set<string> = new Set();
  private functions: Set<string> = new Set();
  private errors: SemanticError[] = [];

  public constructor(private program: Statement[]) {}

  public analyze(): SemanticError[] {
    for (const stmt of this.program) {
      switch (stmt.type) {
        case StatementType.Variable:
          this.checkVariableStatement(stmt);
          break;
        case StatementType.Function:
          this.checkFunctionStatement(stmt);
          break;
        case StatementType.FunctionTable:
          this.checkFunctionTableStatement(stmt);
          break;
        case StatementType.BuiltinCall:
          this.checkBuiltinCallStatement(stmt);
          break;
        case StatementType.Error:
          this.errors.push({
            message: stmt.message,
            range: stmt.range,
          });
          break;
      }
    }

    return this.errors;
  }

  private checkVariableStatement(stmt: Statement) {
    if (stmt.type !== StatementType.Variable) return;

    let error = false;
    if (this.variables.has(stmt.name)) {
      error = true;
      this.errors.push({
        message: `Variable ${stmt.name} already declared`,
        range: stmt.range,
      });
    }

    if (this.functions.has(stmt.name)) {
      error = true;
      this.errors.push({
        message: `Ambiguous variable name ${stmt.name} already declared as a function`,
        range: stmt.range,
      });
    }

    if (!error) {
      this.variables.add(stmt.name);
    }

    this.checkExpression(stmt.value);
  }

  private checkFunctionStatement(stmt: Statement) {
    if (stmt.type !== StatementType.Function) return;

    let error = false;
    if (this.functions.has(stmt.name)) {
      error = true;
      this.errors.push({
        message: `Function ${stmt.name} already declared`,
        range: stmt.range,
      });
    }

    if (this.variables.has(stmt.name)) {
      error = true;
      this.errors.push({
        message: `Ambiguous function name ${stmt.name} already declared as a variable`,
        range: stmt.range,
      });
    }

    const hasDuplicateParams = stmt.parameters.some(
      (param, index) => stmt.parameters.indexOf(param) !== index
    );
    if (hasDuplicateParams) {
      error = true;
      this.errors.push({
        message: `Duplicate parameter names in function ${stmt.name}`,
        range: stmt.range,
      });
    }

    if (!error) {
      this.functions.add(stmt.name);
    }

    this.checkExpression(stmt.body, stmt.parameters);
  }

  private checkFunctionTableStatement(stmt: Statement) {
    if (stmt.type !== StatementType.FunctionTable) return;

    let error = false;
    if (this.functions.has(stmt.name)) {
      error = true;
      this.errors.push({
        message: `Function ${stmt.name} already declared`,
        range: stmt.range,
      });
    }

    if (this.variables.has(stmt.name)) {
      error = true;
      this.errors.push({
        message: `Ambiguous function name ${stmt.name} already declared as a variable`,
        range: stmt.range,
      });
    }

    const hasDuplicateParams = stmt.parameters.some(
      (param, index) => stmt.parameters.indexOf(param) !== index
    );
    if (hasDuplicateParams) {
      error = true;
      this.errors.push({
        message: `Duplicate parameter names in function ${stmt.name}`,
        range: stmt.range,
      });
    }

    const hasDuplicateSubParams = stmt.subparameters.some(
      (param, index) => stmt.subparameters.indexOf(param) !== index
    );
    if (hasDuplicateSubParams) {
      error = true;
      this.errors.push({
        message: `Duplicate subparameter names in function ${stmt.name}`,
        range: stmt.range,
      });
    }

    const expectedLength = Math.pow(stmt.subparameters.length, 2);
    if (stmt.table.length !== expectedLength) {
      error = true;
      this.errors.push({
        message: `Function ${stmt.name} table length mismatch. Expected ${expectedLength}, got ${stmt.table.length}`,
        range: stmt.range,
      });
    }

    const indexes = new Set<string>();
    for (const row of stmt.table) {
      const index = row.index.join("");
      if (indexes.has(index)) {
        error = true;
        this.errors.push({
          message: `Duplicate index ${index} in function ${stmt.name} table`,
          range: stmt.range,
        });
      }

      this.checkExpression(row.value, stmt.subparameters);
    }

    if (!error) {
      this.functions.add(stmt.name);
    }
  }

  private checkBuiltinCallStatement(stmt: Statement) {
    if (stmt.type !== StatementType.BuiltinCall) return;

    const invalidBuiltins = [
      Keywords.ToNand,
      Keywords.ToNor,
      Keywords.SolvePOS,
      Keywords.SolveSOP,
    ];
    if (invalidBuiltins.includes(stmt.name)) {
      this.errors.push({
        message: `Invalid usage of builtin ${stmt.name}`,
        range: stmt.range,
      });
      return;
    }

    switch (stmt.name) {
      case Keywords.Import:
        if (stmt.parameters.length !== 1) {
          this.errors.push({
            message: `Invalid number of parameters for builtin ${stmt.name}`,
            range: stmt.range,
          });
          return;
        }

        if (stmt.parameters[0].type !== ExpressionType.String) {
          this.errors.push({
            message: `Invalid parameter type for builtin ${stmt.name}, expected string`,
            range: stmt.range,
          });
        }
        break;
      case Keywords.Export:
        if (stmt.parameters.length !== 2) {
          this.errors.push({
            message: `Invalid number of parameters for builtin ${stmt.name}`,
            range: stmt.range,
          });
          return;
        }
        if (stmt.parameters[0].type !== ExpressionType.String) {
          this.errors.push({
            message: `Invalid parameter type for builtin ${stmt.name}, expected string as first argument`,
            range: stmt.range,
          });
        }
        this.checkExpression(stmt.parameters[1], [], stmt.name);
        break;
      default:
        {
          for (const param of stmt.parameters) {
            this.checkExpression(param, [], stmt.name);
          }
        }
        break;
    }
  }

  private checkExpression(
    expr: Expression,
    parameters: string[] = [],
    builtin: Keywords | undefined = undefined
  ) {
    switch (expr.type) {
      case ExpressionType.Variable:
        this.checkVariableExpression(expr, parameters, builtin);
        break;
      case ExpressionType.FunctionCall:
        this.checkFunctionCallExpression(expr, parameters, builtin);
        break;
      case ExpressionType.BuiltinCall:
        this.checkBuiltinCallExpression(expr, parameters, expr.name);
        break;
      case ExpressionType.Number:
        this.checkNumberExpression(expr, builtin);
        break;
      case ExpressionType.String:
        this.checkStringExpression(expr, builtin);
        break;
      case ExpressionType.Binary:
        this.checkExpression(expr.left, parameters, builtin);
        this.checkExpression(expr.right, parameters, builtin);
        break;
      case ExpressionType.Unary:
        this.checkExpression(expr.operand, parameters, builtin);
        break;
      case ExpressionType.Error:
        this.errors.push({
          message: expr.message,
          range: expr.range,
        });
        break;
    }
  }

  private checkVariableExpression(
    expr: Expression,
    parameters: string[],
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.Variable) return;

    const isFunction = parameters.length > 0;
    const isBuiltin = builtin !== undefined;

    if (isFunction) {
      if (expr.reference && !this.variables.has(expr.name)) {
        this.errors.push({
          message: `Variable ${expr.name}* not defined`,
          range: expr.range,
        });
      }

      if (!expr.reference && !parameters.includes(expr.name)) {
        this.errors.push({
          message: `Parameter ${expr.name} not defined`,
          range: expr.range,
        });
      }
    } else {
      if (!this.variables.has(expr.name)) {
        this.errors.push({
          message: `Variable ${expr.name} not defined`,
          range: expr.range,
        });
      }

      if (expr.reference) {
        this.errors.push({
          message: `Unexpected variable reference ${expr.name}*`,
          range: expr.range,
        });
      }
    }
  }

  private checkFunctionCallExpression(
    expr: Expression,
    parameters: string[],
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.FunctionCall) return;

    if (!this.functions.has(expr.name)) {
      this.errors.push({
        message: `Function ${expr.name} not defined`,
        range: expr.range,
      });
    }

    for (const param of expr.parameters) {
      this.checkExpression(param, parameters, builtin);
    }
  }

  private checkBuiltinCallExpression(
    expr: Expression,
    parameters: string[],
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.BuiltinCall || builtin === undefined) {
      return;
    }

    const validBuiltins = [
      Keywords.ToNand,
      Keywords.ToNor,
      Keywords.SolvePOS,
      Keywords.SolveSOP,
    ];
    if (!validBuiltins.includes(builtin)) {
      this.errors.push({
        message: `Invalid usage of builtin ${builtin}`,
        range: expr.range,
      });
      return;
    }

    if (expr.parameters.length !== 1) {
      this.errors.push({
        message: `Invalid number of parameters for builtin ${builtin}, expected 1`,
        range: expr.range,
      });
      return;
    }

    this.checkExpression(expr.parameters[0], parameters, builtin);
  }

  private checkNumberExpression(
    expr: Expression,
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.Number) return;

    if (builtin == Keywords.Table) {
      this.errors.push({
        message: `Invalid usage of builtin ${builtin}, cannot pass number as parameter`,
        range: expr.range,
      });
    }
  }

  private checkStringExpression(
    expr: Expression,
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.String) return;

    if (builtin != Keywords.Print) {
      this.errors.push({
        message: `Invalid usage of builtin ${builtin}, cannot pass string as parameter`,
        range: expr.range,
      });
    }
  }
}

const test = () => {
  const program = `
    A = 0
    B = 1

    F(A, B) = A or not B and A*

    PRINT(A, TO_NAND(B))
    `;
  const lexer = new Lexer(program);
  const tokens = lexer.tokenize();

  const parser = new Parser(tokens);
  const ast = parser.parse();

  const semanticAnalyzer = new SemanticAnalyzer(ast);
  console.log(semanticAnalyzer.analyze());
};
test();
