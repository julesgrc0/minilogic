enum TokenType {
  Identifier = "Identifier",
  Number = "Number",
  Equals = "Equals",
  LParen = "LParen",
  RParen = "RParen",
  Comma = "Comma",
  Star = "Star",
  LBracket = "LBracket",
  RBracket = "RBracket",
  Operator = "Operator",
  Keyword = "Keyword",
  EOF = "EOF",
}

enum Operators {
  Not = "not",
  And = "and",
  Or = "or",
  Xor = "xor",
  Nand = "nand",
  Nor = "nor",
  Xnor = "xnor",
  Imply = "imply",
  Nimply = "nimply",
  Equal = "equal",
  Nequal = "nequal",
}

type Token =
  | {
      type: TokenType;
      value: string;
      pos: number;
    }
  | {
      type: "Operator";
      value: Operators;
      pos: number;
    };

class Lexer {
  private pos: number = 0;
  private currentChar: string | null;

  private keywords = new Set(["PRINT", "SHOW", "TABLE", "GRAPH"]);
  private operators = new Set([
    "not",
    "and",
    "or",
    "xor",
    "nand",
    "nor",
    "xnor",
    "imply",
    "nimply",
    "equal",
    "nequal",
  ]);

  private tokens: Record<number, Token> = {};

  constructor(private input: string) {
    this.currentChar = input.charAt(0);
  }

  private pushToken(pos: number, token: Omit<Token, "pos">): Token {
    this.tokens[pos] = { ...token, pos: this.pos } as Token;
    return this.tokens[pos];
  }

  private advance() {
    this.pos++;
    this.currentChar =
      this.pos < this.input.length ? this.input.charAt(this.pos) : null;
  }

  private skipWhitespace() {
    while (this.currentChar !== null && /\s/.test(this.currentChar)) {
      this.advance();
    }
  }

  private number(): Token {
    let result = "";
    while (this.currentChar !== null && /[01]/.test(this.currentChar)) {
      result += this.currentChar;
      this.advance();
    }
    return this.pushToken(this.pos, { type: TokenType.Number, value: result });
  }

  private identifier(): Token {
    let result = "";
    while (this.currentChar !== null && /[A-Za-z]/.test(this.currentChar)) {
      result += this.currentChar;
      this.advance();
    }
    if (this.keywords.has(result.toUpperCase())) {
      return this.pushToken(this.pos, {
        type: TokenType.Keyword,
        value: result.toUpperCase(),
      });
    }
    if (this.operators.has(result.toLowerCase())) {
      return this.pushToken(this.pos, {
        type: TokenType.Operator,
        value: result.toLowerCase() as Operators,
      });
    }
    return this.pushToken(this.pos, {
      type: TokenType.Identifier,
      value: result,
    });
  }

  public getTokenById(id: number): Token | undefined {
    return this.tokens[id];
  }

  public getNextToken(): Token {
    while (this.currentChar !== null) {
      if (/\s/.test(this.currentChar)) {
        this.skipWhitespace();
        continue;
      }

      if (/[A-Za-z]/.test(this.currentChar)) {
        return this.identifier();
      }

      if (/[01]/.test(this.currentChar)) {
        return this.number();
      }

      if (this.currentChar === "=") {
        this.advance();
        return this.pushToken(this.pos, { type: TokenType.Equals, value: "=" });
      }

      if (this.currentChar === "(") {
        this.advance();
        return this.pushToken(this.pos, { type: TokenType.LParen, value: "(" });
      }

      if (this.currentChar === ")") {
        this.advance();
        return this.pushToken(this.pos, { type: TokenType.RParen, value: ")" });
      }

      if (this.currentChar === ",") {
        this.advance();
        return this.pushToken(this.pos, { type: TokenType.Comma, value: "," });
      }

      if (this.currentChar === "*") {
        this.advance();
        return this.pushToken(this.pos, { type: TokenType.Star, value: "*" });
      }

      if (this.currentChar === "[") {
        this.advance();
        return this.pushToken(this.pos, {
          type: TokenType.LBracket,
          value: "[",
        });
      }

      if (this.currentChar === "]") {
        this.advance();
        return this.pushToken(this.pos, {
          type: TokenType.RBracket,
          value: "]",
        });
      }

      throw new Error(
        `Unexpected character '${this.currentChar}' at position ${this.pos}`
      );
    }

    return this.pushToken(this.pos, { type: TokenType.EOF, value: "" });
  }
}

export { Lexer, TokenType, Token, Operators };
