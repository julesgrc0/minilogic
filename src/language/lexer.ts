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

      line: number;
      column: number;
    }
  | {
      type: "Operator";
      value: Operators;
      pos: number;

      line: number;
      column: number;
    };
class Lexer {
  private pos: number = 0;
  private line: number = 0;
  private column: number = 0;
  private currentChar: string | null;
  private tokens: Record<number, Token> = {};

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

  constructor(private input: string) {
    this.currentChar = input.charAt(0);
  }

  private pushToken(
    startPos: number,
    token: Omit<Token, "pos" | "line" | "column">
  ): Token {
    
    this.tokens[startPos] = {
      ...token,
      pos: startPos,
      line: this.line,
      column: this.column,
    } as any;

    return this.tokens[startPos];
  }

  private advance(): void {
    if (this.currentChar === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }

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
    const startPos = this.pos;
    const startCol = this.column;
    while (this.currentChar !== null && /[01]/.test(this.currentChar)) {
      result += this.currentChar;
      this.advance();
    }
    return this.pushToken(startPos, { type: TokenType.Number, value: result });
  }

  private identifier(): Token {
    let result = "";
    const startPos = this.pos;
    const startCol = this.column;
    while (this.currentChar !== null && /[A-Za-z]/.test(this.currentChar)) {
      result += this.currentChar;
      this.advance();
    }

    if (this.keywords.has(result.toUpperCase())) {
      return this.pushToken(startPos, {
        type: TokenType.Keyword,
        value: result.toUpperCase(),
      });
    }
    if (this.operators.has(result.toLowerCase())) {
      return this.pushToken(startPos, {
        type: TokenType.Operator,
        value: result.toLowerCase() as Operators,
      });
    }

    return this.pushToken(startPos, {
      type: TokenType.Identifier,
      value: result,
    });
  }

  private skipComment(): void {
    while (this.currentChar !== null && this.currentChar !== "\n") {
      this.advance();
    }
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
      // handle comments "#"

      if (this.currentChar === "#") {
        this.skipComment();
        continue;
      }

      if (/[A-Za-z]/.test(this.currentChar)) return this.identifier();
      if (/[01]/.test(this.currentChar)) return this.number();

      const startPos = this.pos;

      switch (this.currentChar) {
        case "=":
          this.advance();
          return this.pushToken(startPos, {
            type: TokenType.Equals,
            value: "=",
          });
        case "(":
          this.advance();
          return this.pushToken(startPos, {
            type: TokenType.LParen,
            value: "(",
          });
        case ")":
          this.advance();
          return this.pushToken(startPos, {
            type: TokenType.RParen,
            value: ")",
          });
        case ",":
          this.advance();
          return this.pushToken(startPos, {
            type: TokenType.Comma,
            value: ",",
          });
        case "*":
          this.advance();
          return this.pushToken(startPos, { type: TokenType.Star, value: "*" });
        case "[":
          this.advance();
          return this.pushToken(startPos, {
            type: TokenType.LBracket,
            value: "[",
          });
        case "]":
          this.advance();
          return this.pushToken(startPos, {
            type: TokenType.RBracket,
            value: "]",
          });
      }

      throw new Error(
        `Unexpected character '${this.currentChar}' at line ${this.line}, column ${this.column}`
      );
    }

    return this.pushToken(this.pos, { type: TokenType.EOF, value: "" });
  }
}

export { Lexer, TokenType, Token, Operators };
