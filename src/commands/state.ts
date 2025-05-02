import * as vscode from "vscode";
import { CodeFix, Lexer, Token } from "../language/lexer";
import { Parser, Statement } from "../language/parser";
import { SemanticError, SemanticErrorAnalyzer } from "../language/semantic/error_analyser";
import { SemanticWarning, SemanticWarningAnalyzer } from "../language/semantic/warning_analyser";
import { SemanticErrorSolver } from "../language/semantic/error_solver";
import { SemanticWarningSolver } from "../language/semantic/warning_solver";

type DocumentState = {
  text: string;

  lexer: Lexer;
  tokens: Token[];

  parser: Parser;
  ast: Statement[];

  a_errors: SemanticError[];
  s_errors: CodeFix[];

  a_warnings: SemanticWarning[];
  s_warnings: CodeFix[];
}

export const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("minilogic");

export const stateMap = new Map<string, DocumentState>();

export const updateState = (document: vscode.TextDocument): DocumentState => {
  const text = document.getText();

  const lexer = new Lexer(text);
  const tokens = lexer.tokenize();

  const parser = new Parser(tokens);
  const ast = parser.parse();

  const sea = new SemanticErrorAnalyzer(ast);
  const a_errors = sea.analyze();
  const s_errors = new SemanticErrorSolver(a_errors, sea.getVariableNames(), sea.getFunctionNames()).solve()

  const saw = new SemanticWarningAnalyzer(ast);
  const a_warnings = saw.analyze();
  const s_warnings = new SemanticWarningSolver(a_warnings).solve()


  stateMap.set(document.uri.toString(), {
    text,
    lexer,
    tokens,
    parser,
    ast,
    a_errors,
    s_errors,
    a_warnings,
    s_warnings,
  });

  return stateMap.get(document.uri.toString()) as DocumentState;
}

export const getOrCreateState = (document: vscode.TextDocument): DocumentState => {
  const state = stateMap.get(document.uri.toString());
  if (state) {
    return state;
  }
  return updateState(document);
}