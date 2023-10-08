import {pick} from '../utils/object'
import {getJSType} from '../utils/type'
import {formatParagraph, replaceQuote} from '../utils/text'
import type {
  ParserMeta,
  ParserContructor,
  ParseType,
  ParseResult,
  EnumProperty
} from "../types/Parser";
import BaseParser from './BaseParser';

const EnumParser: ParserContructor = class EnumParser extends BaseParser {
  static ENUM_RE = /public\s+enum\s+(?<enum_name>\w+)/g

  // TODO 更多形式
  static PROPERTY_RE = /\s(?<key>[A-Z_]+?)\((?<value>\S+?)\s*,\s*(?<desc>\S+?)\)/g

  private enumName: string;
  private properties: EnumProperty[];

  constructor(
    javaCode: string,
    javaPath: string,
    meta?: ParserMeta
  ) {
    super(javaCode, javaPath, meta);
    this._getEnumName();
    this._getProperties();
    return this;
  }

  private _getEnumName() {
    const cRe = new RegExp(EnumParser.ENUM_RE)
    const classMatch: RegExpMatchArray = cRe.exec(this.javaCode);
    this.enumName = classMatch?.groups?.enum_name;
  }

  private _getProperties() {
    const properties: EnumProperty[] = [];
    const pRe = new RegExp(EnumParser.PROPERTY_RE)
    let propertyMatch: RegExpMatchArray;
    while ((propertyMatch = pRe.exec(this.javaCode)) !== null) {
      const p: EnumProperty = pick(propertyMatch.groups, 'desc', 'key', 'value')
      p.type = /["']+/.test(p.value) ? 'String' : 'Number'
      properties.push(p)
    }
    this.properties = properties;
  }

  private _getJSDoc() {
    if (!this.properties.length) return '';
    const enumType = getJSType(this.properties[0].type);
    let result = new RegExp(EnumParser.PROPERTY_RE).test(this.javaCode)
      ? this.properties.map(prop => {
        const {desc, key, value, type} = prop
        const pVlu = replaceQuote(value, `'`)
        const pDesc = replaceQuote(desc)
        return '  ' + `${key}: ${pVlu}, // ${pDesc}`.trim()
      }).join('\n').trim()
      : '* @todo no property'
    result = `export const ${this.enumName} = {\n${result}\n}`
    result = `/**\n * @readonly\n * @enum {${enumType}}\n */\n${result}`
    return formatParagraph(result);
  }

  // TODO ts
  parse(type: ParseType = 'jsdoc') {
    const rtn: ParseResult = {
      javaPath: this.javaPath,
      result: null
    }

    if (type === 'jsdoc') {
      rtn.result = this._getJSDoc()
    }

    return rtn;
  }
}

export default EnumParser;
