import {
  Lexer,
  BinaryNumber,
  Keywords,
  Token,
  TokenType,
  Operators,
  Position,
} from "./lexer";

enum StatementType {
  Variable = "Variable",
  Function = "Function",
  FunctionTable = "FunctionTable",
  BuiltinCall = "BuiltinCall",
  Comment = "Comment",
  Error = "Error",
}

enum ExpressionType {
  Number = "Number",
  String = "String",

  Binary = "Binary",
  Unary = "Unary",

  Variable = "Variable",
  FunctionCall = "FunctionCall",
  BuiltinCall = "BuiltinCall",

  Error = "Error",
}

type FunctionTableBody = { index: BinaryNumber[]; value: Expression }[];

type Statement = (
  | {
      type: StatementType.Variable;
      name: string;
      value: Expression;
    }
  | {
      type: StatementType.Function;
      name: string;
      parameters: string[];
      body: Expression;
    }
  | {
      type: StatementType.FunctionTable;
      name: string;
      parameters: string[];
      subparameters: string[];
      table: FunctionTableBody;
    }
  | {
      type: StatementType.BuiltinCall;
      name: Keywords;
      parameters: Expression[];
    }
  | {
      type: StatementType.Comment;
      value: string;
    }
  | {
      type: StatementType.Error;
      message: string;
    }
) & {
  range: { start: Position; end: Position };
};

type Expression = (
  | {
      type: ExpressionType.Number;
      value: BinaryNumber;
    }
  | {
      type: ExpressionType.String;
      value: string;
    }
  | {
      type: ExpressionType.Binary;
      left: Expression;
      operator: Operators;
      right: Expression;
    }
  | {
      type: ExpressionType.Unary;
      operator: Operators;
      operand: Expression;
    }
  | {
      type: ExpressionType.Variable;
      name: string;
      reference: boolean;
    }
  | {
      type: ExpressionType.FunctionCall;
      name: string;
      parameters: Expression[];
    }
  | {
      type: ExpressionType.BuiltinCall;
      name: Keywords;
      parameters: Expression[];
    }
  | {
      type: ExpressionType.Error;
      message: string;
    }
) & {
  range: { start: Position; end: Position };
};

class Parser {
  private index: number = 0;
  private current: Token;

  public constructor(private tokens: Token[]) {
    if (tokens.length === 0) {
      this.current = {
        type: TokenType.EOF,
        value: null,
        start: { line: 0, column: 0, offset: 0 },
        end: { line: 0, column: 0, offset: 0 },
      };
      return;
    }

    this.current = this.tokens[this.index];
  }

  public parse(): Statement[] {
    const statements: Statement[] = [];
    while (this.current.type !== TokenType.EOF) {
      let stmt: Statement;
      try {
        stmt = this.parseStatement();
      } catch {
        stmt = {
          type: StatementType.Error,
          message: `Unexpected token: ${this.current.type}`,
          range: {
            start: this.current.start,
            end: this.current.end,
          },
        };
        this.next();
      }
      statements.push(stmt);
    }
    return statements;
  }

  private eat(type: TokenType): Token {
    if (
      this.index < this.tokens.length &&
      this.tokens[this.index].type === type
    ) {
      return this.next();
    }
    throw new Error("EAT ERROR");
  }

  private next(): Token {
    if (this.index + 1 < this.tokens.length) {
      this.index++;
      this.current = this.tokens[this.index];
      return this.current;
    }

    this.current = {
      type: TokenType.EOF,
      value: null,
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 0, offset: 0 },
    };
    return this.current;
  }

  private parseStatement(): Statement {
    switch (this.current.type) {
      case TokenType.Keyword:
        return this.parseBuiltinCall();
      case TokenType.Comment:
        const cmt = this.current;
        this.eat(TokenType.Comment);
        return {
          type: StatementType.Comment,
          value: cmt.value,
          range: {
            start: cmt.start,
            end: cmt.end,
          },
        };
      case TokenType.Identifier: {
        const name = this.current;

        this.current = this.eat(TokenType.Identifier);
        if (this.current.type === TokenType.Equal) {
          return this.parseVariable(name);
        }

        return this.parseFunction(name);
      }
      default: {
        const token = this.current;
        this.next();
        return {
          type: StatementType.Error,
          message: `Unexpected token when parsing statement: ${token.type}`,
          range: {
            start: token.start,
            end: token.end,
          },
        };
      }
    }
  }

  private parseBuiltinCall(): Statement {
    const start = this.current.start;

    const name = this.current.value as Keywords;
    this.eat(TokenType.Keyword);
    this.eat(TokenType.LParen);

    const parameters: Expression[] = [];
    while (this.current.type !== TokenType.RParen) {
      parameters.push(this.parseExpression());
      if (this.current.type === TokenType.Comma) {
        this.eat(TokenType.Comma);
      }
    }
    this.eat(TokenType.RParen);

    return {
      type: StatementType.BuiltinCall,
      name,
      parameters,
      range: {
        start,
        end: this.current.end,
      },
    };
  }

  private parseVariable(name: Token): Statement {
    this.eat(TokenType.Equal);
    return {
      type: StatementType.Variable,
      name: name.value as string,
      value: this.parseExpression(),
      range: {
        start: name.start,
        end: this.current.end,
      },
    };
  }

  private parseFunction(name: Token): Statement {
    this.eat(TokenType.LParen);

    const parameters: string[] = [];
    const subparameters: string[] = [];

    let sub = false;

    while (this.current.type !== TokenType.RParen) {
      if (this.current.type === TokenType.Identifier) {
        (sub ? subparameters : parameters).push(this.current.value as string);
      }
      this.eat(TokenType.Identifier);

      if (this.current.type === TokenType.Bar) {
        sub = true;
        this.eat(TokenType.Bar);
        continue;
      }

      if (this.current.type === TokenType.Comma) {
        this.eat(TokenType.Comma);
      }
    }
    this.eat(TokenType.RParen);
    this.current = this.eat(TokenType.Equal);

    if (subparameters.length > 0 || this.current.type === TokenType.LBracket) {
      return {
        type: StatementType.FunctionTable,
        name: name.value as string,
        parameters,
        subparameters,
        table: this.parseFunctionTable(),
        range: {
          start: name.start,
          end: this.current.end,
        },
      };
    }

    return {
      type: StatementType.Function,
      name: name.value as string,
      parameters,
      body: this.parseExpression(),
      range: {
        start: name.start,
        end: this.current.end,
      },
    };
  }

  private parseFunctionTable(): FunctionTableBody {
    this.eat(TokenType.LBracket);
    const table: FunctionTableBody = [];
    while (this.current.type !== TokenType.RBracket) {
      let index: BinaryNumber[] = [];

      if (this.current.type === TokenType.BinaryNumberList) {
        index = this.current.value as BinaryNumber[];
        this.eat(TokenType.BinaryNumberList);
      } else {
        index = [this.current.value as BinaryNumber];
        this.eat(TokenType.BinaryNumber);
      }

      this.eat(TokenType.Comma);
      const value = this.parseExpression();
      table.push({ index, value });
    }

    this.eat(TokenType.RBracket);
    return table;
  }

  private getOperatorPrecedence(operator: Operators): number {
    if (operator === Operators.Not) return 3;
    if (operator === Operators.And || operator === Operators.Nand) return 2;
    return 1;
  }

  private parseExpression(precedence: number = 0): Expression {
    let left = this.parseUnaryExpression();

    while (
      this.current.type === TokenType.Operator &&
      this.getOperatorPrecedence(this.current.value as Operators) >= precedence
    ) {
      const operator = this.current.value as Operators;
      const opPrecedence = this.getOperatorPrecedence(operator);

      this.eat(TokenType.Operator);
      const right = this.parseExpression(opPrecedence + 1);

      left = {
        type: ExpressionType.Binary,
        left,
        operator,
        right,
        range: {
          start: left.range.start,
          end: right.range.end,
        },
      };
    }

    return left;
  }

  private parseUnaryExpression(): Expression {
    if (
      this.current.type === TokenType.Operator &&
      this.current.value === Operators.Not
    ) {
      this.eat(TokenType.Operator);
      const operand = this.parseUnaryExpression();

      return {
        type: ExpressionType.Unary,
        operator: Operators.Not,
        operand,
        range: {
          start: this.current.start,
          end: operand.range.end,
        },
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    switch (this.current.type) {
      case TokenType.Identifier: {
        const name = this.current;
        this.current = this.eat(TokenType.Identifier);
        if (this.current.type === TokenType.LParen) {
          return this.parseFunctionCallExpression(name);
        }

        let reference = false;
        if (this.current.type === TokenType.Star) {
          reference = true;
          this.eat(TokenType.Star);
        }

        return {
          type: ExpressionType.Variable,
          name: name.value,
          reference,
          range: {
            start: name.start,
            end: this.current.end,
          },
        };
      }
      case TokenType.Keyword: {
        const name = this.current;
        this.eat(TokenType.Keyword);
        return this.parseFunctionCallExpression(name, true);
      }
      case TokenType.LParen: {
        this.eat(TokenType.LParen);
        const expr = this.parseExpression();
        this.eat(TokenType.RParen);
        return expr;
      }
      case TokenType.String:
        const str = this.current;
        this.eat(TokenType.String);
        return {
          type: ExpressionType.String,
          value: str.value,
          range: {
            start: str.start,
            end: str.end,
          },
        };
      case TokenType.BinaryNumber:
        const num = this.current;
        this.eat(TokenType.BinaryNumber);
        return {
          type: ExpressionType.Number,
          value: num.value as BinaryNumber,
          range: {
            start: num.start,
            end: num.end,
          },
        };
      default: {
        const token = this.current;
        this.next();
        return {
          type: ExpressionType.Error,
          message: `Unexpected token when parsing expression: ${token.type}`,
          range: {
            start: token.start,
            end: token.end,
          },
        };
      }
    }
  }

  private parseFunctionCallExpression(
    name: Token,
    builtin: boolean = false
  ): Expression {
    const start = name.start;

    this.eat(TokenType.LParen);
    const parameters: Expression[] = [];

    while (this.current.type !== TokenType.RParen) {
      parameters.push(this.parseExpression());
      if (this.current.type === TokenType.Comma) {
        this.eat(TokenType.Comma);
      }
    }

    this.eat(TokenType.RParen);
    return {
      type: builtin ? ExpressionType.BuiltinCall : ExpressionType.FunctionCall,
      name: name.value as any,
      parameters,
      range: {
        start,
        end: this.current.end,
      },
    };
  }
}

export {
  Parser,
  Statement,
  Expression,
  StatementType,
  ExpressionType,
  FunctionTableBody,
};
