export enum AnalyticsSerializerTypes {
  AnalyticsPath,
  AnalyticsPathSegment,
  AnalyticsPeriod,
}

export enum AnalyticsPeriodType {
  Year,
  Quarter,
  Month,
}

export class AnalyticsPeriod {
  get type(): AnalyticsPeriodType {
    return this._type;
  }
  get year(): number {
    return this._year;
  }
  get quarter(): number | null {
    return this._quarter;
  }
  get month(): number | null {
    return this._month;
  }

  private _type: AnalyticsPeriodType = AnalyticsPeriodType.Year;
  private _year: number = 1970;
  private _quarter: number | null = null;
  private _month: number | null = null;

  public toJSON() {
    return {
      _t: AnalyticsSerializerTypes.AnalyticsPeriod,
      _v: this.toString(),
    };
  }

  public static fromString(period: string): AnalyticsPeriod {
    let result: AnalyticsPeriod;

    if (period.length === 4) {
      result = new AnalyticsPeriod(Number.parseInt(period));
    } else if (period.length === 7) {
      if (period[4] !== "/") {
        throw new Error(`Invalid period string: '${period}'`);
      } else if (period[5] === "Q") {
        result = new AnalyticsPeriod(
          Number.parseInt(period.slice(0, 4)),
          Number.parseInt(period[6]),
        );
      } else {
        result = new AnalyticsPeriod(
          Number.parseInt(period.slice(0, 4)),
          undefined,
          Number.parseInt(period.slice(5)),
        );
      }
    } else {
      throw new Error(`Invalid period string: '${period}'`);
    }

    return result;
  }

  public static fillRange(
    p1: AnalyticsPeriod | string,
    p2: AnalyticsPeriod | string,
  ): AnalyticsPeriod[] {
    const obj1 = typeof p1 === "string" ? AnalyticsPeriod.fromString(p1) : p1,
      obj2 = typeof p2 === "string" ? AnalyticsPeriod.fromString(p2) : p2;

    if (obj1.type !== obj2.type) {
      throw new Error(
        `Cannot fill range of different type periods ${obj1.toString()} and ${obj2.toString()}.`,
      );
    }

    const [first, last] = obj1.comesBefore(obj2) ? [obj1, obj2] : [obj2, obj1];
    const result = [first];

    let next = first.nextPeriod();
    while (next.comesBefore(last)) {
      result.push(next);
      next = next.nextPeriod();
    }

    if (!last.equals(first)) {
      result.push(last);
    }

    return result;
  }

  public static normalizeQuarters(year: number, quarter: number): PeriodTriple {
    const newYear = year + Math.floor((quarter - 1) / 4);
    const newQuarter = moduloButWithoutBugs(quarter - 1, 4) + 1;
    return [newYear, newQuarter, undefined];
  }

  public static normalizeMonths(year: number, month: number): PeriodTriple {
    const newYear = year + Math.floor((month - 1) / 12);
    const newMonth = moduloButWithoutBugs(month - 1, 12) + 1;
    const newQuarter = Math.floor((newMonth - 1) / 3) + 1;
    return [newYear, newQuarter, newMonth];
  }

  public constructor(year: number, quarter?: number, month?: number) {
    this._initAsYear(year);

    if (quarter !== undefined) {
      this._initAsQuarter(quarter);
    }

    if (month !== undefined) {
      this._initAsMonth(month);
    }
  }

  public equals(period: AnalyticsPeriod | string): boolean {
    return (
      this.toString() ===
      (typeof period === "string" ? period : period.toString())
    );
  }

  public toString(): string {
    let result =
      this._year + (this._type === AnalyticsPeriodType.Year ? "" : "/");

    if (this._type === AnalyticsPeriodType.Quarter) {
      result += "Q" + this._quarter;
    } else if (this._type === AnalyticsPeriodType.Month) {
      if ((this._month as number) < 10) {
        result += "0";
      }
      result += this._month;
    }

    return result;
  }

  public startAsSqlDate(): string {
    let result = this._year + "-";

    switch (this._type) {
      case AnalyticsPeriodType.Month:
        result += ((this._month as number) < 10 ? "0" : "") + this.month;
        break;

      case AnalyticsPeriodType.Quarter:
        const firstMonth = ((this._quarter as number) - 1) * 3 + 1;
        result += ((firstMonth as number) < 10 ? "0" : "") + firstMonth;
        break;

      case AnalyticsPeriodType.Year:
        result += "01";
        break;
    }

    return result + "-01";
  }

  public comesAfter(period: AnalyticsPeriod): boolean {
    return this._start() > period._end();
  }

  public comesBefore(period: AnalyticsPeriod): boolean {
    return period._start() > this._end();
  }

  public contains(period: AnalyticsPeriod): boolean {
    return this._start() <= period._start() && this._end() >= period._end();
  }

  public firstMonth(): AnalyticsPeriod {
    let month: number = this._month || 1;

    if (this._type === AnalyticsPeriodType.Quarter) {
      month = ((this._quarter as number) - 1) * 3 + 1;
    }

    return new AnalyticsPeriod(this._year, undefined, month);
  }

  public lastMonth(): AnalyticsPeriod {
    let month: number = this._month || 12;

    if (this._type === AnalyticsPeriodType.Quarter) {
      month = (this._quarter as number) * 3;
    }

    return new AnalyticsPeriod(this._year, undefined, month);
  }

  public nextPeriod(n: number = 1): AnalyticsPeriod {
    return this._addPeriods(n);
  }

  public previousPeriod(n: number = 1): AnalyticsPeriod {
    return this._addPeriods(-n);
  }

  private _start(): number {
    return this._getNumericComparator(false);
  }

  private _end(): number {
    return this._getNumericComparator(true);
  }

  private _getNumericComparator(endOfPeriod: boolean): number {
    const defaultQuarter = endOfPeriod ? 4 : 1,
      defaultMonth =
        ((this._quarter || defaultQuarter) - 1) * 3 + (endOfPeriod ? 3 : 1),
      result =
        this._year * 1000 +
        (this._quarter || defaultQuarter) * 100 +
        (this._month || defaultMonth);

    return result;
  }

  private _addPeriods(periods: number): AnalyticsPeriod {
    let result: AnalyticsPeriod;

    if (this._type === AnalyticsPeriodType.Year) {
      result = new AnalyticsPeriod(this._year + periods);
    } else if (this._type === AnalyticsPeriodType.Quarter) {
      const [y, q] = AnalyticsPeriod.normalizeQuarters(
        this._year,
        (this._quarter as number) + periods,
      );
      result = new AnalyticsPeriod(y, q);
    } else {
      const [y, _, m] = AnalyticsPeriod.normalizeMonths(
        this._year,
        (this._month as number) + periods,
      );
      result = new AnalyticsPeriod(y, undefined, m);
    }

    return result;
  }

  private _initAsYear(year: number) {
    if (year < 1970 || year > 2100) {
      throw new Error(`Invalid period year: '${year}'`);
    }

    this._year = year;
  }

  private _initAsQuarter(quarter: number) {
    if (quarter < 1 || quarter > 4) {
      throw new Error(`Invalid period quarter: ${quarter}`);
    }

    this._quarter = quarter;
    this._type = AnalyticsPeriodType.Quarter;
  }

  private _initAsMonth(month: number) {
    if (month < 1 || month > 12) {
      throw new Error(`Invalid period month: ${month}`);
    }

    if (this.quarter == null) {
      this._initAsQuarter(Math.floor((month - 1) / 3) + 1);
    } else if (this.quarter !== Math.floor((month - 1) / 3) + 1) {
      throw new Error(
        `Period month ${month} outside of quarter ${this.quarter}`,
      );
    }

    this._month = month;
    this._type = AnalyticsPeriodType.Month;
  }
}

// See https://stackoverflow.com/questions/4467539/javascript-modulo-gives-a-negative-result-for-negative-numbers
function moduloButWithoutBugs(base: number, n: number) {
  return ((base % n) + n) % n;
}

type PeriodTriple = [number, number | undefined, number | undefined];
