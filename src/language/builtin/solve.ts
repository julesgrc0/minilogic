import { Operators } from "../lexer";
import { Expression, ExpressionType } from "../parser";
import { RANGE_NOT_SET } from "../utils";

interface Implicant {
  bits: string;
  covers: Set<string>;
}

class Solve {
  constructor(
    private variables: string[],
    private minterms: string[],
  ) {}

  public solve(): Expression {
    const primeImplicants = this.applyQuineMcCluskey();
    return this.applyPetricksMethod(primeImplicants);
  }

  private applyQuineMcCluskey(): Implicant[] {
    let groups: Map<number, Implicant[]> = new Map();
    for (const m of this.minterms) {
      const count = m.split("").filter((b) => b === "1").length;
      const impl: Implicant = { bits: m, covers: new Set([m]) };
      if (!groups.has(count)) groups.set(count, []);
      groups.get(count)!.push(impl);
    }

    const primeImplicants: Implicant[] = [];
    let iteration = 0;
    while (true) {
      const newGroups: Map<number, Implicant[]> = new Map();
      const marked = new Set<Implicant>();

      const counts = Array.from(groups.keys()).sort((a, b) => a - b);
      for (let i = 0; i < counts.length - 1; i++) {
        const g1 = groups.get(counts[i])!;
        const g2 = groups.get(counts[i + 1])!;
        for (const impl1 of g1) {
          for (const impl2 of g2) {
            const diff = this.getSingleBitDifference(impl1.bits, impl2.bits);
            if (diff >= 0) {
              marked.add(impl1);
              marked.add(impl2);
              const combinedBits = this.combineBits(impl1.bits, diff);
              const covers = new Set([...impl1.covers, ...impl2.covers]);
              const countOnes = combinedBits
                .split("")
                .filter((b) => b === "1").length;
              const newImpl: Implicant = { bits: combinedBits, covers };
              if (!newGroups.has(countOnes)) newGroups.set(countOnes, []);

              if (
                !newGroups.get(countOnes)!.some((x) => x.bits === combinedBits)
              ) {
                newGroups.get(countOnes)!.push(newImpl);
              }
            }
          }
        }
      }

      for (const group of groups.values()) {
        for (const impl of group) {
          if (!marked.has(impl)) {
            primeImplicants.push(impl);
          }
        }
      }

      if (newGroups.size === 0) break;
      groups = newGroups;
      iteration++;
      if (iteration > 20) break;
    }

    return primeImplicants;
  }

  private applyPetricksMethod(primeImplicants: Implicant[]): Expression {
    const chart: Map<string, Implicant[]> = new Map();
    for (const m of this.minterms) chart.set(m, []);
    for (const impl of primeImplicants) {
      for (const m of impl.covers) {
        if (chart.has(m)) chart.get(m)!.push(impl);
      }
    }

    const essentials = new Set<Implicant>();
    for (const [m, imps] of chart.entries()) {
      if (imps.length === 1) essentials.add(imps[0]);
    }

    const remaining = new Set(this.minterms);
    for (const impl of essentials) {
      for (const m of impl.covers) remaining.delete(m);
    }

    let selected = Array.from(essentials);
    if (remaining.size > 0) {
      let P: Set<Set<Implicant>> | null = null;
      for (const m of remaining) {
        const covers = chart.get(m)!;
        const sum: Set<Set<Implicant>> = new Set();
        for (const impl of covers) sum.add(new Set([impl]));
        if (P === null) {
          P = sum;
        } else {
          // multiply P * sum
          const next: Set<Set<Implicant>> = new Set();
          for (const prod of P) {
            for (const term of sum) {
              const union = new Set([...prod, ...term]);
              next.add(union);
            }
          }
          P = this.simplifyProducts(next);
        }
      }
      const best = Array.from(P!).reduce(
        (bestSet, curr) => {
          if (!bestSet) return curr;
          if (curr.size < bestSet.size) return curr;
          return bestSet;
        },
        null as Set<Implicant> | null,
      )!;
      selected = selected.concat(Array.from(best));
    }

    const exprs = selected.map((impl) => this.convertToExpression(impl.bits));
    return exprs.reduce(
      (acc, e) => {
        if (!acc) return e;
        return {
          type: ExpressionType.Binary,
          operator: Operators.Or,
          left: acc,
          right: e,
          range: RANGE_NOT_SET,
        };
      },
      null as Expression | null,
    )!;
  }

  private simplifyProducts(products: Set<Set<Implicant>>): Set<Set<Implicant>> {
    const arr = Array.from(products);
    const result: Set<Set<Implicant>> = new Set(arr);
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length; j++) {
        if (i !== j) {
          const a = arr[i],
            b = arr[j];
          if (this.isSuperset(a, b)) {
            result.delete(a);
          }
        }
      }
    }
    return result;
  }

  private isSuperset(a: Set<any>, b: Set<any>): boolean {
    for (const x of b) {
      if (!a.has(x)) return false;
    }
    return true;
  }

  private getSingleBitDifference(a: string, b: string): number {
    let idx = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        if (idx >= 0) return -1;
        idx = i;
      }
    }
    return idx;
  }

  private combineBits(a: string, i: number): string {
    return a.slice(0, i) + "-" + a.slice(i + 1);
  }

  private convertToExpression(bits: string): Expression {
    const terms: Expression[] = [];
    for (let i = 0; i < bits.length; i++) {
      const v: Expression = {
        type: ExpressionType.Variable,
        name: this.variables[i],
        reference: false,
        range: RANGE_NOT_SET,
      };
      if (bits[i] === "1") {
        terms.push(v);
      } else if (bits[i] === "0") {
        terms.push({
          type: ExpressionType.Unary,
          operator: Operators.Not,
          operand: v,
          range: RANGE_NOT_SET,
        });
      }
    }
    return terms.reduce(
      (a, b) => ({
        type: ExpressionType.Binary,
        operator: Operators.And,
        left: a,
        right: b,
        range: RANGE_NOT_SET,
      }),
      terms[0]!,
    );
  }
}

export { Solve };
