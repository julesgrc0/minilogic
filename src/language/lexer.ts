type Position = {
  line: number;
  column: number;
  offset: number;
};

type Range = {
  start: Position;
  end: Position;
};

type CodeFix = {
  message: string;
  value: string | null;
} & Range;

enum TokenType {
  Identifier = "Identifier",
  Operator = "Operator",
  Keyword = "Keyword",
  BinaryNumber = "BinaryNumber",
  BinaryNumberList = "BinaryNumberList",
  String = "String",

  Equal = "Equal",
  Star = "Star",
  Comma = "Comma",
  Bar = "Bar",

  LParen = "LParen",
  RParen = "RParen",

  LBracket = "LBracket",
  RBracket = "RBracket",

  Comment = "Comment",
  Error = "Error",
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
}

enum Keywords {
  Print = "PRINT",
  Show = "SHOW",
  Table = "TABLE",
  Graph = "GRAPH",

  Export = "EXPORT",
  Import = "IMPORT",

  ToNand = "TO_NAND",
  ToNor = "TO_NOR",

  SolveSOP = "SOLVE_SOP",
  SolvePOS = "SOLVE_POS",
}

type BinaryNumber = 1 | 0;

type Token = {
  start: Position;
  end: Position;
} & (
  | {
      type: TokenType;
      value: string;
    }
  | {
      type: TokenType.Operator;
      value: Operators;
    }
  | {
      type: TokenType.Keyword;
      value: Keywords;
    }
  | {
      type: TokenType.BinaryNumber;
      value: BinaryNumber;
    }
  | {
      type: TokenType.BinaryNumberList;
      value: BinaryNumber[];
    }
  | {
      type: TokenType.EOF;
      value: null;
    }
);
class Lexer {
  private pos = 0;
  private line = 0;
  private column = -1;
  private currentChar: string | null;
  private tokens: Token[] = [];

  private keywords = new Set(Object.values(Keywords));
  private operators = new Set(Object.values(Operators));
  private symbols = {
    "=": TokenType.Equal,
    "*": TokenType.Star,
    ",": TokenType.Comma,
    "|": TokenType.Bar,
    "(": TokenType.LParen,
    ")": TokenType.RParen,
    "[": TokenType.LBracket,
    "]": TokenType.RBracket,
  };

  public constructor(private input: string) {
    this.currentChar = this.input[this.pos] ?? null;
  }

  public tokenize(): Token[] {
    while (this.currentChar !== null) {
      if (/\s/.test(this.currentChar)) {
        this.skipWhitespace();
        continue;
      }

      const start = this.getPosition();

      if (this.currentChar === "#") {
        this.tokens.push(this.comment());
        continue;
      }

      if (this.currentChar === "0" || this.currentChar === "1") {
        this.tokens.push(this.binaryStringToken());
        continue;
      }

      if (this.currentChar === '"') {
        this.tokens.push(this.string());
        continue;
      }

      if (/[a-zA-Z_]/.test(this.currentChar)) {
        this.tokens.push(this.identifier());
        continue;
      }

      const found = Object.keys(this.symbols).includes(this.currentChar);

      this.tokens.push({
        type: found
          ? this.symbols[this.currentChar as keyof typeof this.symbols]
          : TokenType.Error,
        value: found
          ? this.currentChar
          : `Unexpected character: ${this.currentChar}`,
        start,
        end: start,
      });

      this.advance();
    }

    this.tokens.push({
      type: TokenType.EOF,
      start: this.getPosition(),
      end: this.getPosition(),
      value: null,
    });

    return this.tokens;
  }

  private binaryStringToken(): Token {
    const start = this.getPosition();
    let value: BinaryNumber[] = [];

    while (this.currentChar === "0" || this.currentChar === "1") {
      value.push(this.currentChar === "1" ? 1 : 0);
      this.advance();
    }

    return {
      type: (value.length == 1
        ? TokenType.BinaryNumber
        : TokenType.BinaryNumberList) as any,
      value: value.length == 1 ? value[0] : value,
      start,
      end: this.getPosition(),
    };
  }

  private skipWhitespace() {
    while (this.currentChar !== null && /\s/.test(this.currentChar)) {
      if (this.currentChar === "\n") {
        this.line++;
        this.column = -1;
      } else {
        this.column++;
      }
      this.advance();
    }
  }

  private identifier(): Token {
    const start = this.getPosition();
    let value = "";

    while (this.currentChar !== null && /\w/.test(this.currentChar)) {
      value += this.currentChar;
      this.advance();
    }

    if (this.keywords.has(value as Keywords)) {
      return {
        type: TokenType.Keyword,
        value: value as Keywords,
        start,
        end: this.getPosition(),
      };
    } else if (this.operators.has(value as Operators)) {
      return {
        type: TokenType.Operator,
        value: value as Operators,
        start,
        end: this.getPosition(),
      };
    } else {
      return {
        type: TokenType.Identifier,
        value,
        start,
        end: this.getPosition(),
      };
    }
  }

  private comment(): Token {
    const start = this.getPosition();
    let value = "";
    while (this.currentChar !== null && this.currentChar !== "\n") {
      value += this.currentChar;
      this.advance();
    }
    return {
      type: TokenType.Comment,
      value,
      start,
      end: this.getPosition(),
    };
  }

  private string(): Token {
    const start = this.getPosition();
    let value = "";
    this.advance();

    while (this.currentChar !== null && this.currentChar !== '"') {
      if (this.currentChar === "\\") {
        this.advance();
        switch (this.currentChar as any) {
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          case '"':
            value += '"';
            break;
          default:
            value += this.currentChar;
            break;
        }
      } else {
        value += this.currentChar;
      }
      this.advance();
    }
    if (this.currentChar === '"') {
      this.advance();
    } else {
      return {
        type: TokenType.Error,
        value: `Unterminated string literal`,
        start,
        end: this.getPosition(),
      };
    }
    return {
      type: TokenType.String,
      value,
      start,
      end: this.getPosition(),
    };
  }

  private advance() {
    this.pos++;
    this.column++;
    this.currentChar = this.input[this.pos] ?? null;
  }

  private getPosition(): Position {
    return { line: this.line, column: this.column, offset: this.pos };
  }
}

export {
  Lexer,
  TokenType,
  Token,
  Operators,
  Keywords,
  BinaryNumber,
  Position,
  Range,
  CodeFix,
};
