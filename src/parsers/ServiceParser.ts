import pick from 'lodash-es/pick'
import {getJSType} from '../utils/type'
import {formatParagraph} from '../utils/text'
import {
  ParserMeta,
  ParserContructor,
  ControllerType,
  ServiceType,
  ServiceParamType,
  ParseType,
  ParseResult
} from "../types/Parser";
import BaseParser from './BaseParser';

const ServiceParser: ParserContructor = class ServiceParser extends BaseParser {
  static CONTROLLER_RE = /@RestController\s*\n\s*@RequestMapping\(\"(?<url>[\w\/_-{}:]+?)\"\)\s*\npublic\s+class\s+(?<name>\w+?)Controller\s+/g;

  static SERVICE_RE = /(\/\*{2}\n\s+\*\s+(?<desc>[^@\s]*?)\n(?:[\s\S]+?))?@(?:(?<method>Get|Post|Update|Put|Delete)?)Mapping\(\s*value\s*=\s*"(?<url>[\w\/_-{}:]+?)\".*?\)(?:[\s\S]+?)public\s+(?<res>[\w<>_[\](,\s)]+?)\s+(?<name>[\w_-]+?)\((?<params_str>[\s\S]+?)?\)\s*{/gi;

  static PARAM_RE = /(?<param_annotation>@.*?\s)?(?<param_type>\w+)\s+(?<param_name>\w+)(?:,\s*)?/g;

  private controller: ControllerType;
  private services: ServiceType[];

  constructor(
    javaCode: string,
    javaPath: string,
    meta?: ParserMeta
  ) {
    super(javaCode, javaPath, meta);
    this._getController();
    this._getServices();
    return this;
  }

  private _getController() {
    const match = new RegExp(ServiceParser.CONTROLLER_RE).exec(this.javaCode)
    if (!match?.groups) throw new Error('invalid controller')
    this.controller = pick(match.groups, 'url', 'name');
  }

  private _getServices() {
    const services: ServiceType[] = []
    const sRe = new RegExp(ServiceParser.SERVICE_RE)
    let serviceMatch: RegExpMatchArray;
    while ((serviceMatch = sRe.exec(this.javaCode)) !== null) {
      const {params_str} = serviceMatch.groups;
      const params: ServiceParamType[] = []
      const pRe = new RegExp(ServiceParser.PARAM_RE)
      let paramMatch: RegExpMatchArray
      const paramStr = (params_str || '').replace(/[\n\r]/g, '').replace(/\s+/g, ' ')
      while ((paramMatch = pRe.exec(paramStr)) !== null) {
        const p: ServiceParamType = pick(paramMatch.groups,
          'param_type', 'param_name', 'param_annotation');
        params.push(p);
      }
      const s: ServiceType = {
        params,
        ...pick(serviceMatch.groups, 'desc', 'method', 'url', 'res', 'name')
      };
      services.push(s);
    }
    this.services = services
  }

  private _renderServices(service: ServiceType) {
    const url = `${this.controller.url}${service.url}`
    const reqUrl = service.params.reduce((acc, param) => {
      const {param_name, param_annotation: pa} = param;
      const placeholder = `{${param_name}}`
      if (pa?.includes('PathVariable') && acc.includes(placeholder)) {
        acc = acc.replace(placeholder, `$${placeholder}`)
      }
      return acc
    }, '`' + url + '`')
    const funcName = url
      .replace(/\/{\w+?}/g, '') // placeholder
      .replace(/\/(\w)/g, (_, p1) => p1.toUpperCase())
      .replace(/^\w/, m => m.toLowerCase())
    const jsdocParams = service.params.map(param => {
      const {param_type: pt, param_name: pn, param_annotation: pa} = param
      const isHeader = pa?.includes('RequestHeader')
      const isOptional = !pa || !pa.includes('@NotNull')
      const pName = isHeader ? `headers.${pn}` : pn
      const name = isOptional ? ` [${pName}]` : ` ${pName}`
      return `* @param {${getJSType(pt)}} ${name}`.trim()
    }).join('\n ').trim()
    const mapParams = param => {
      const {param_name: pn, param_annotation: pa} = param
      const isHeader = pa?.includes('RequestHeader')
      return isHeader ? null : pn
    }
    const funcArgs = service.params.map(mapParams).filter(Boolean).join(', ')
    const bodyOrParams = service.params
      .filter(({param_annotation: pa}) => !pa || !pa.includes('PathVariable'))
      .map(mapParams)
      .filter(Boolean)
      .map(param => this.javaCode.includes('ResponseBody')
        ? `...${param}`
        : param
      )
      .join(',\n      ')
    const mtd = service.method.toLowerCase()
    const paramsKey = /(post|put|patch|delete)/.test(mtd) ? 'body' : 'params'

    return `/** ${funcName}
 * @url ${url}
 * @method ${mtd.toUpperCase()}
 ${jsdocParams}
 * @return {Promise<${getJSType(service.res)}>}\n */\n
export function ${funcName} (${funcArgs}) {
  return ${this.meta.jsDocServiceRequestInstanceName}({
    url: ${reqUrl},
    method: '${mtd}',
    ${paramsKey}: {
      ${bodyOrParams}
    }
  })
}
  `
  }

  private _getJSDoc() {
    const cont = formatParagraph(
      this.services.map(this._renderServices)
        .join('\n')
        .trim()
    )
    return `${this.meta.jsDocServiceTopImport}\n\n${cont}`
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

export default ServiceParser;
