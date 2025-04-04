import { Lexer, Operators, Token, TokenType } from "./lexer";

enum StatementType {
  Assignment = "Assignment",
  FunctionDefinition = "FunctionDefinition",
  BuiltinCall = "BuiltinCall",
}

enum ExpressionType {
  BinaryExpression = "BinaryExpression",
  UnaryExpression = "UnaryExpression",
  Variable = "Variable",
  Number = "Number",
  FunctionCall = "FunctionCall",
  TableDefinition = "TableDefinition",
}

enum BuiltinType {
  Print = "PRINT",
  Show = "SHOW",
  Table = "TABLE",
  Graph = "GRAPH",
}

type BinaryNumber = 0 | 1;
type BinaryVarNumber = BinaryNumber | "X";
type TableRow = {
  input: { value: BinaryNumber; id: number }[][];
  output: BinaryVarNumber[];
};

type StatementCase =
  | {
      type: StatementType.Assignment;
      variable: string;
      expression: Expression;
    }
  | {
      type: StatementType.FunctionDefinition;
      name: string;
      parameters: string[];
      expression: Expression;
    }
  | {
      type: StatementType.BuiltinCall;
      name: BuiltinType;
      args: Expression[];
    };

type ExpressionCase =
  | {
      type: ExpressionType.BinaryExpression;
      left: Expression;
      operator: Operators;
      right: Expression;
    }
  | {
      type: ExpressionType.UnaryExpression;
      operator: Operators;
      operand: Expression;
    }
  | {
      type: ExpressionType.Variable;
      name: string;
      reference: boolean;
    }
  | {
      type: ExpressionType.Number;
      value: BinaryNumber;
    }
  | {
      type: ExpressionType.FunctionCall;
      name: string;
      args: Expression[];
    }
  | {
      type: ExpressionType.TableDefinition;
      rows: TableRow[];
    };

type Statement = {
  id: number;
} & StatementCase;

type Expression = {
  id: number;
} & ExpressionCase;

class Parser {
  private currentToken: Token;

  constructor(private lexer: Lexer) {
    this.currentToken = this.lexer.getNextToken();
  }

  private eat(tokenType: TokenType): Token {
    if (this.currentToken.type === tokenType) {
      const prevToken = this.currentToken;
      this.currentToken = this.lexer.getNextToken();
      return prevToken;
    } else {
      throw new Error(
        `Unexpected token ${this.currentToken.value} at pos ${this.currentToken.pos}, expected ${tokenType}`
      );
    }
  }

  public parseProgram(): Statement[] {
    const statements: Statement[] = [];
    while (this.currentToken.type !== TokenType.EOF) {
      statements.push(this.parseStatement());
    }
    return statements;
  }

  private parseStatement(): Statement {
    if (this.currentToken.type === TokenType.Keyword) {
      return this.parseBuiltinCall();
    }

    const token = this.currentToken;
    this.eat(TokenType.Identifier);

    if (this.currentToken.type === TokenType.Equals) {
      this.eat(TokenType.Equals);
      const expr = this.parseExpression();
      return {
        id: token.pos,
        type: StatementType.Assignment,
        variable: token.value,
        expression: expr,
      };
    } else if (this.currentToken.type === TokenType.LParen) {
      this.eat(TokenType.LParen);
      const params: string[] = [];

      if ((this.currentToken.type as TokenType) === TokenType.Identifier) {
        params.push(this.currentToken.value);
        this.eat(TokenType.Identifier);

        while ((this.currentToken.type as TokenType) === TokenType.Comma) {
          this.eat(TokenType.Comma);
          params.push(this.currentToken.value);
          this.eat(TokenType.Identifier);
        }
      }
      this.eat(TokenType.RParen);
      this.eat(TokenType.Equals);

      const expr =
        (this.currentToken.type as TokenType) === TokenType.LBracket
          ? this.parseTableDefinition()
          : this.parseExpression();
      return {
        id: token.pos,
        type: StatementType.FunctionDefinition,
        name: token.value,
        parameters: params,
        expression: expr,
      };
    }
    throw new Error(`Invalid statement starting with token ${token.value}`);
  }

  private parseTableDefinition(): Expression {
    const token = this.currentToken;
    this.eat(TokenType.LBracket);
    const rows: TableRow[] = [];

    while (this.currentToken.type !== TokenType.RBracket) {
      const input: { value: BinaryNumber; id: number }[][] = [];
      const output: BinaryVarNumber[] = [];

      let currentInput: { value: BinaryNumber; id: number }[] = [];
      while (this.currentToken.type === TokenType.Number) {
        const bits = this.currentToken.value.split("");
        for (const bit of bits) {
          if (bit !== "0" && bit !== "1") {
            throw new Error(`Invalid binary number ${this.currentToken.value}`);
          }
          currentInput.push({
            value: parseInt(bit) as BinaryNumber,
            id: this.currentToken.pos,
          });
        }
        this.eat(TokenType.Number);
      }
      input.push(currentInput);

      this.eat(TokenType.Comma);

      if ((this.currentToken.type as TokenType) === TokenType.Number) {
        const bit = this.currentToken.value;
        if (bit !== "0" && bit !== "1" && bit !== "X") {
          throw new Error(`Invalid binary number ${this.currentToken.value}`);
        }
        output.push((bit === "X" ? "X" : parseInt(bit)) as BinaryVarNumber);
        this.eat(TokenType.Number);
      } else if (
        this.currentToken.type === TokenType.Identifier &&
        this.currentToken.value === "X"
      ) {
        output.push("X");
        this.eat(TokenType.Identifier);
      } else {
        throw new Error(
          `Unexpected token ${this.currentToken.value} in truth table`
        );
      }

      rows.push({ input, output });

      if ((this.currentToken.type as TokenType) === TokenType.Comma) {
        this.eat(TokenType.Comma);
      }
    }

    this.eat(TokenType.RBracket);
    return { id: token.pos, type: ExpressionType.TableDefinition, rows };
  }

  private parseBuiltinCall(): Statement {
    const token = this.eat(TokenType.Keyword);
    this.eat(TokenType.LParen);
    const args: Expression[] = [];

    if (this.currentToken.type !== TokenType.RParen) {
      args.push(this.parseExpression());
      while (this.currentToken.type === TokenType.Comma) {
        this.eat(TokenType.Comma);
        args.push(this.parseExpression());
      }
    }
    this.eat(TokenType.RParen);
    return {
      id: token.pos,
      type: StatementType.BuiltinCall,
      name: token.value as BuiltinType,
      args,
    };
  }

  private parseExpression(precedence: number = 0): Expression {
    let left = this.parseUnaryExpression();

    while (
      this.currentToken.type === TokenType.Operator &&
      this.getPrecedence(this.currentToken.value as Operators) >= precedence
    ) {
      const token = this.currentToken;
      const opPrecedence = this.getPrecedence(token.value as Operators);
      this.eat(TokenType.Operator);
      const right = this.parseExpression(opPrecedence + 1);

      left = {
        id: token.pos,
        type: ExpressionType.BinaryExpression,
        left,
        operator: token.value as Operators,
        right,
      };
    }

    return left;
  }

  private getPrecedence(operator: Operators): number {
    if (operator === Operators.Not) return 3;
    if (operator === Operators.And || operator === Operators.Nand) return 2;
    return 1;
  }
  private parseUnaryExpression(): Expression {
    if (
      this.currentToken.type === TokenType.Operator &&
      this.currentToken.value === Operators.Not
    ) {
      const token = this.currentToken;
      this.eat(TokenType.Operator);
      const operand = this.parseUnaryExpression();

      return {
        id: token.pos,
        type: ExpressionType.UnaryExpression,
        operator: token.value as Operators,
        operand,
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    const token = this.currentToken;

    if (token.type === TokenType.Number) {
      this.eat(TokenType.Number);
      if (
        token.value.length !== 1 ||
        (token.value !== "0" && token.value !== "1")
      ) {
        throw new Error(
          `Invalid binary number ${token.value} at pos ${token.pos}`
        );
      }
      return {
        id: token.pos,
        type: ExpressionType.Number,
        value: parseInt(token.value) as BinaryNumber,
      };
    }

    if (token.type === TokenType.Identifier) {
      this.eat(TokenType.Identifier);

      if (this.currentToken.type === TokenType.LParen) {
        this.eat(TokenType.LParen);
        const args: Expression[] = [];

        if ((this.currentToken.type as TokenType) !== TokenType.RParen) {
          args.push(this.parseExpression());
          while ((this.currentToken.type as TokenType) === TokenType.Comma) {
            this.eat(TokenType.Comma);
            args.push(this.parseExpression());
          }
        }
        this.eat(TokenType.RParen);
        return {
          id: token.pos,
          type: ExpressionType.FunctionCall,
          name: token.value,
          args,
        };
      }

      let reference = false;
      if (this.currentToken.type === TokenType.Star) {
        reference = true;
        this.eat(TokenType.Star);
      }

      return {
        id: token.pos,
        type: ExpressionType.Variable,
        name: token.value,
        reference,
      };
    }

    if (token.type === TokenType.LParen) {
      this.eat(TokenType.LParen);
      const expr = this.parseExpression();
      this.eat(TokenType.RParen);
      return expr;
    }

    throw new Error(`Unexpected token ${token.value} in expression`);
  }
}

export {
  Parser,
  BuiltinType,
  StatementType,
  Statement,
  ExpressionType,
  Expression,
  TableRow,
  BinaryNumber,
  BinaryVarNumber,
};
