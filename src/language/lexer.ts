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
  Comment = "Comment",
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

  private keywords = new Set([
    "PRINT",
    "SHOW",
    "TABLE",
    "GRAPH",
    "EXPORT",
    "TO_NAND",
    "TO_NOR",
    "SIMPLIFY",
  ]);
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
    while (this.currentChar !== null && /[01]/.test(this.currentChar)) {
      result += this.currentChar;
      this.advance();
    }
    return this.pushToken(startPos, { type: TokenType.Number, value: result });
  }

  private identifier(): Token {
    let result = "";
    const startPos = this.pos;
    while (this.currentChar !== null && /[A-Za-z0-9_]/.test(this.currentChar)) {
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

  private comment(): Token {
    let result = "";
    const startPos = this.pos;
    while (this.currentChar !== null && this.currentChar !== "\n") {
      result += this.currentChar;
      this.advance();
    }
    return this.pushToken(startPos, { type: TokenType.Comment, value: result });
  }

  public getTokenById(id: number): Token | undefined {
    return this.tokens[id];
  }

  public getTokenByPosition(line: number, column: number): Token | undefined {
    const exact = Object.values(this.tokens).find(
      (token) => token.line === line && token.column === column
    );
    if (exact) return exact;

    const sameLineBefore = Object.values(this.tokens)
      .filter((token) => token.line === line && token.column <= column)
      .sort((a, b) => b.column - a.column)[0];

    if (sameLineBefore) return sameLineBefore;

    const sameLineAfter = Object.values(this.tokens)
      .filter((token) => token.line === line && token.column > column)
      .sort((a, b) => a.column - b.column)[0];

    if (sameLineAfter) return sameLineAfter;

    const beforeLine = Object.values(this.tokens)
      .filter((token) => token.line < line)
      .sort((a, b) => b.line - a.line || b.column - a.column)[0];

    if (beforeLine) return beforeLine;

    const afterLine = Object.values(this.tokens)
      .filter((token) => token.line > line)
      .sort((a, b) => a.line - b.line || a.column - b.column)[0];

    return afterLine;
  }

  public getNextToken(noerror = false): Token {
    while (this.currentChar !== null) {
      if (/\s/.test(this.currentChar)) {
        this.skipWhitespace();
        continue;
      }

      if (this.currentChar === "#") return this.comment();
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

      this.advance();
      if (noerror) {
        return this.pushToken(this.pos, { type: TokenType.EOF, value: "" });
      }

      throw new Error(
        `Unexpected character '${this.currentChar}' at line ${this.line}, column ${this.column}`
      );
    }

    return this.pushToken(this.pos, { type: TokenType.EOF, value: "" });
  }
}

export { Lexer, TokenType, Token, Operators };
