import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'

export interface Options<TMessage = unknown> {
  viewType?: string
  title?: string
  scripts?: string | (string | { enforce?: 'pre' | 'post'; src: string })[]
  styles?: string | string[]
  onMessage?: (data: TMessage) => void
  viewColumn?: vscode.ViewColumn
  retainContextWhenHidden?: boolean
  enableScripts?: boolean
  mediaRoot?: string
  localResourceRoots?: vscode.Uri[]
  allowedScriptSources?: string[]
  allowedStyleSources?: string[]
  allowedImageSources?: string[]
  allowedFontSources?: string[]
  allowedConnectSources?: string[]
  allowedMediaSources?: string[]
  allowedFrameSources?: string[]
  allowedManifestSources?: string[]
  allowedWorkerSources?: string[]
  allowedPrefetchSources?: string[]
  strictCsp?: boolean
  csp?: string
  existingCsp?: 'error' | 'replace'
  /**
   * Trusted HTML only. Do not pass unsanitized user or workspace content.
   */
  html?: string
  exposeVsCodeApi?: boolean | string
}
interface ParsedHtmlAttribute {
  name: string
  value?: string
  valueStart: number
  valueEnd: number
}

export class CreateWebview<TMessage = unknown> {
  private webviewView?: vscode.WebviewPanel
  private createRequestId = 0
  private _deferScript = ''
  private _extensionUri: vscode.Uri
  private mediaRoot: string
  private localResourceRoots: vscode.Uri[]
  private props: Record<string, any> = {}
  private deferredScriptUris: string[] = []
  private viewColumn: vscode.ViewColumn
  private _viewType: string
  private _title: string
  private _html: string
  private _scripts: (string | { enforce?: 'pre' | 'post'; src: string })[]
  private _styles: string[]
  private retainContextWhenHidden: boolean
  private enableScripts: boolean
  private allowedScriptSources: string[]
  private allowedStyleSources: string[]
  private allowedImageSources: string[]
  private allowedFontSources: string[]
  private allowedConnectSources: string[]
  private allowedMediaSources: string[]
  private allowedFrameSources: string[]
  private allowedManifestSources: string[]
  private allowedWorkerSources: string[]
  private allowedPrefetchSources: string[]
  private strictCsp: boolean
  private csp?: string
  private existingCsp: 'error' | 'replace'
  private onMessage?: (data: TMessage) => void
  private exposeVsCodeApi?: string
  constructor(
    extension: vscode.ExtensionContext | vscode.Uri,
    options: Options<TMessage>,
  ) {
    this._extensionUri = 'extensionUri' in extension ? extension.extensionUri : extension
    this.mediaRoot = options.mediaRoot || 'media'
    this.localResourceRoots = options.localResourceRoots || [vscode.Uri.joinPath(this._extensionUri, this.mediaRoot)]
    this._title = options.title || 'webview'
    this._viewType = options.viewType || this._title
    this._html = options.html || ''
    this._scripts = options.scripts
      ? (Array.isArray(options.scripts) ? options.scripts : [options.scripts])
      : []
    this._styles = options.styles
      ? (Array.isArray(options.styles) ? options.styles : [options.styles])
      : []
    this.viewColumn = options.viewColumn || vscode.ViewColumn.One
    this.retainContextWhenHidden = options.retainContextWhenHidden ?? false
    this.enableScripts = options.enableScripts ?? true
    this.allowedScriptSources = options.allowedScriptSources || []
    this.allowedStyleSources = options.allowedStyleSources || []
    this.allowedImageSources = options.allowedImageSources || []
    this.allowedFontSources = options.allowedFontSources || []
    this.allowedConnectSources = options.allowedConnectSources || []
    this.allowedMediaSources = options.allowedMediaSources || []
    this.allowedFrameSources = options.allowedFrameSources || []
    this.allowedManifestSources = options.allowedManifestSources || []
    this.allowedWorkerSources = options.allowedWorkerSources || []
    this.allowedPrefetchSources = options.allowedPrefetchSources || []
    this.strictCsp = options.strictCsp ?? false
    this.csp = options.csp
    this.existingCsp = options.existingCsp || 'error'
    if (!this.csp) {
      this._assertValidCspSourceTokens('allowedScriptSources', this.allowedScriptSources)
      this._assertValidCspSourceTokens('allowedStyleSources', this.allowedStyleSources)
      this._assertValidCspSourceTokens('allowedImageSources', this.allowedImageSources)
      this._assertValidCspSourceTokens('allowedFontSources', this.allowedFontSources)
      this._assertValidCspSourceTokens('allowedConnectSources', this.allowedConnectSources)
      this._assertValidCspSourceTokens('allowedMediaSources', this.allowedMediaSources)
      this._assertValidCspSourceTokens('allowedFrameSources', this.allowedFrameSources)
      this._assertValidCspSourceTokens('allowedManifestSources', this.allowedManifestSources)
      this._assertValidCspSourceTokens('allowedWorkerSources', this.allowedWorkerSources)
      this._assertValidCspSourceTokens('allowedPrefetchSources', this.allowedPrefetchSources)
    }
    this.onMessage = options.onMessage
    if (options.exposeVsCodeApi === true)
      this.exposeVsCodeApi = 'vscode'
    else if (typeof options.exposeVsCodeApi === 'string')
      this.exposeVsCodeApi = options.exposeVsCodeApi
  }

  public setProps(props: Record<string, any>) {
    this.props = { ...this.props, ...props }
  }

  /**
   * Creates a webview from trusted HTML. Do not pass unsanitized user or workspace content.
   */
  public async create(html = this._html, callback: (data: TMessage) => void = () => { }) {
    const requestId = ++this.createRequestId
    const webviewView = vscode.window.createWebviewPanel(
      this._viewType, // 视图的声明方式
      this._title, // 选项卡标题
      this.viewColumn, // 在编辑器中显示的视图位置
      {
        enableScripts: this.enableScripts, // 启用JS,否则内容将被视为静态HTML
        localResourceRoots: this.localResourceRoots,
        retainContextWhenHidden: this.retainContextWhenHidden,
      },
    )

    let renderedHtml: string
    try {
      renderedHtml = await this._getHtmlForWebview(
        webviewView.webview,
        html,
      )
    }
    catch (error) {
      webviewView.dispose()
      if (requestId !== this.createRequestId)
        return
      throw error
    }

    if (requestId !== this.createRequestId) {
      webviewView.dispose()
      return
    }

    this._bindMessageHandler(webviewView, callback)
    webviewView.webview.html = renderedHtml
    this.webviewView?.dispose()
    this.webviewView = webviewView
    webviewView.onDidDispose(() => {
      if (this.webviewView === webviewView)
        this.webviewView = undefined
    })
  }

  public async createWithHTMLUrl(htmlUrl: string, callback: (data: TMessage) => void = () => { }) {
    const requestId = ++this.createRequestId
    let bytes: Uint8Array
    try {
      bytes = await vscode.workspace.fs.readFile(this._getExtensionFileUri(htmlUrl))
    }
    catch (error) {
      if (requestId !== this.createRequestId)
        return
      throw error
    }
    if (requestId !== this.createRequestId)
      return

    let html = new TextDecoder('utf-8').decode(bytes)
    const hasExistingCsp = this._hasCspMeta(html)
    if (hasExistingCsp) {
      if (this.existingCsp !== 'replace')
        throw new Error('createWithHTMLUrl received HTML with an existing CSP meta. Remove it before rendering.')
      html = this._removeCspMeta(html)
    }

    const webviewView = vscode.window.createWebviewPanel(
      this._viewType, // 视图的声明方式
      this._title, // 选项卡标题
      this.viewColumn, // 在编辑器中显示的视图位置
      {
        enableScripts: this.enableScripts, // 启用JS,否则内容将被视为静态HTML
        localResourceRoots: this.localResourceRoots,
        retainContextWhenHidden: this.retainContextWhenHidden,
      },
    )

    try {
      const content = await this._getWebviewContent(webviewView.webview)
      if (requestId !== this.createRequestId) {
        webviewView.dispose()
        return
      }

      const renderedHtml = this._injectHeadContent(
        this._rewriteHtmlResources(html, webviewView.webview),
        content.head,
      )
      this._bindMessageHandler(webviewView, callback)
      webviewView.webview.html = this._injectBodyEndContent(renderedHtml, content.bodyEnd)
    }
    catch (error) {
      webviewView.dispose()
      if (requestId !== this.createRequestId)
        return
      throw error
    }

    if (requestId !== this.createRequestId) {
      webviewView.dispose()
      return
    }

    this.webviewView?.dispose()
    this.webviewView = webviewView
    webviewView.onDidDispose(() => {
      if (this.webviewView === webviewView)
        this.webviewView = undefined
    })
  }

  public isActive() {
    return this.webviewView?.active ?? false
  }

  /**
   * @deprecated Use destroy().
   */
  public destory() {
    this.destroy()
  }

  public destroy() {
    this.createRequestId++
    this.webviewView?.dispose()
    this.webviewView = undefined
  }

  public deferScript(scripts: string | string[]) {
    this._deferScript
      = typeof scripts === 'string' ? scripts : scripts.join('\n')
  }

  /**
   * @deprecated Use addDeferredScriptUris() or setDeferredScriptUris().
   */
  public deferScriptUri(scriptUri: string | string[]) {
    this.addDeferredScriptUris(scriptUri)
  }

  public setDeferredScriptUris(scriptUri: string | string[]) {
    this.deferredScriptUris = typeof scriptUri === 'string' ? [scriptUri] : [...scriptUri]
  }

  public addDeferredScriptUris(scriptUri: string | string[]) {
    const uris = typeof scriptUri === 'string' ? [scriptUri] : scriptUri
    this.deferredScriptUris.push(...uris)
  }

  public clearDeferredScriptUris() {
    this.deferredScriptUris = []
  }

  public async postMessage(data: unknown) {
    return this.webviewView?.webview.postMessage(data) ?? false
  }

  private async _getHtmlForWebview(webview: vscode.Webview, html: string) {
    const content = await this._getWebviewContent(webview)

    return `<!DOCTYPE html>
			<html lang="en">
        <head>
          <meta charset="UTF-8">
          ${content.head}
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${this._escapeHtmlText(this._title)}</title>
        </head>
        <body>
          ${html}
          ${content.bodyEnd}
        </body>
			</html>`
  }

  private async _getWebviewContent(webview: vscode.Webview) {
    const nonce = this._getNonce()
    const styles = this._styles
      .filter(Boolean)
      .map((style) => {
        this._assertSupportedResourceUri(style, 'style')
        this._assertExternalResourceAllowed('style', style, this.allowedStyleSources)
        const styleUri = this._isExternalUri(style)
          ? style
          : webview.asWebviewUri(
            this._getMediaUri(style),
          )
        return `<link href="${this._escapeHtmlAttribute(styleUri.toString())}" rel="stylesheet">`
      })
      .join('\n')

    if (!this.enableScripts) {
      return {
        head: `${this._getCspMeta(webview, nonce)}
          ${styles}`,
        bodyEnd: '',
      }
    }

    const preScripts: string[] = []
    const postScripts: string[] = []
    const scripts = this._scripts

    scripts.forEach((script) => {
      let isPre = false
      if (typeof script !== 'string') {
        isPre = script.enforce === 'pre'
        script = script.src
      }
      if (!script)
        return

      if (/^<script\b/i.test(script.trim()))
        throw new Error('Use script paths/URLs in options.scripts; use deferScript for inline scripts.')

      this._assertSupportedResourceUri(script, 'script')
      this._assertExternalResourceAllowed('script', script, this.allowedScriptSources)
      const scriptUri = this._isExternalUri(script)
        ? script
        : webview.asWebviewUri(
          this._getMediaUri(script),
        )
      const _script = `<script src="${this._escapeHtmlAttribute(scriptUri.toString())}"></script>`

      if (isPre)
        preScripts.push(_script)
      else
        postScripts.push(_script)
    })
    const scriptsUri = this.deferredScriptUris
      .map((uri) => {
        this._assertSupportedResourceUri(uri, 'deferred script')
        this._assertLocalMediaPath(uri, 'deferred script')
        const src = webview.asWebviewUri(this._getMediaUri(uri)).toString()
        return `<script src="${this._escapeHtmlAttribute(src)}"></script>`
      })
    let vscodeApiScript = ''
    if (this.exposeVsCodeApi) {
      const apiName = this._serializeForInlineScript(this.exposeVsCodeApi)
      vscodeApiScript = `<script nonce="${nonce}">
            if (!window[${apiName}])
              window[${apiName}] = acquireVsCodeApi();
          </script>`
    }

    return {
      head: `${this._getCspMeta(webview, nonce)}
          ${styles}
          ${vscodeApiScript}
          <script nonce="${nonce}">
            window.__WEBVIEW_PROPS__ = ${this._serializeForInlineScript(this.props)}
          </script>
          ${preScripts.length ? preScripts.join('\n') : ''}`,
      bodyEnd: `${postScripts.join('\n')}
        ${this._renderInlineScript(this._deferScript, nonce)}
        ${scriptsUri.join('\n')}`,
    }
  }

  private _getMediaUri(uri: string) {
    const match = uri.match(/^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/)
    const rawPath = match?.[1] ?? uri
    const query = match?.[2] ?? ''
    const fragment = match?.[3] ?? ''
    const normalized = this._normalizeSafePath(rawPath, 'media', uri)

    const mediaUri = vscode.Uri.joinPath(this._extensionUri, this.mediaRoot, normalized)
    return query || fragment ? mediaUri.with({ query, fragment }) : mediaUri
  }

  private _getExtensionFileUri(uri: string) {
    this._assertRelativeExtensionPath(uri)
    const normalized = this._normalizeSafePath(uri, 'extension file', uri)

    return vscode.Uri.joinPath(this._extensionUri, normalized)
  }

  private _normalizeSafePath(path: string, kind: string, originalUri: string) {
    const normalized = path
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^\.\/+/, '')

    let decoded = ''
    try {
      decoded = decodeURIComponent(normalized).replace(/\\/g, '/')
    }
    catch {
      throw new Error(`Invalid ${kind} path: ${originalUri}`)
    }

    if (decoded.split('/').some(segment => segment.toLowerCase() === '..'))
      throw new Error(`Invalid ${kind} path: ${originalUri}`)

    return normalized
  }

  private _getNonce() {
    return randomBytes(16).toString('base64')
  }

  private _getCspMeta(webview: vscode.Webview, nonce: string) {
    return `<meta http-equiv="Content-Security-Policy" content="${this._escapeHtmlAttribute(this._getCsp(webview, nonce))}">`
  }

  private _getCsp(webview: vscode.Webview, nonce: string) {
    if (this.csp) {
      return this.csp
        .replace(/\$\{nonce\}/g, nonce)
        .replace(/\$\{webview.cspSource\}/g, webview.cspSource)
    }

    const scriptSources = this.enableScripts
      ? [`'nonce-${nonce}'`, webview.cspSource, ...this.allowedScriptSources]
      : ['\'none\'']
    const styleSources = [webview.cspSource, ...this.allowedStyleSources]
    const imageSources = this.strictCsp
      ? [webview.cspSource, ...this.allowedImageSources]
      : [webview.cspSource, 'https:', 'data:', ...this.allowedImageSources]
    const fontSources = this.strictCsp
      ? [webview.cspSource, ...this.allowedFontSources]
      : [webview.cspSource, 'https:', 'data:', ...this.allowedFontSources]
    const connectSources = [webview.cspSource, ...this.allowedConnectSources]
    const mediaSources = [webview.cspSource, ...this.allowedMediaSources]
    const frameSources = [webview.cspSource, ...this.allowedFrameSources]
    const manifestSources = [webview.cspSource, ...this.allowedManifestSources]
    const workerSources = this.enableScripts
      ? [webview.cspSource, ...this.allowedWorkerSources]
      : ['\'none\'']
    const prefetchSources = [webview.cspSource, ...this.allowedPrefetchSources]

    return [
      'default-src \'none\'',
      'base-uri \'none\'',
      'form-action \'none\'',
      'object-src \'none\'',
      `img-src ${imageSources.join(' ')}`,
      `font-src ${fontSources.join(' ')}`,
      `connect-src ${connectSources.join(' ')}`,
      `style-src ${styleSources.join(' ')}`,
      `script-src ${scriptSources.join(' ')}`,
      `media-src ${mediaSources.join(' ')}`,
      `frame-src ${frameSources.join(' ')}`,
      `manifest-src ${manifestSources.join(' ')}`,
      `worker-src ${workerSources.join(' ')}`,
      `prefetch-src ${prefetchSources.join(' ')}`,
    ].join('; ')
  }

  private _injectHeadContent(html: string, content: string) {
    if (/<head\b[^>]*>/i.test(html))
      return html.replace(/<head\b[^>]*>/i, match => `${match}\n${content}`)

    if (/<html\b[^>]*>/i.test(html))
      return html.replace(/<html\b[^>]*>/i, match => `${match}\n<head>\n${content}\n</head>`)

    const doctypeMatch = html.match(/^(\s*<!doctype\b[^>]*>)([\s\S]*)$/i)
    if (doctypeMatch) {
      const [, doctype, rest] = doctypeMatch
      if (/<body\b[^>]*>/i.test(rest))
        return `${doctype}\n<html>\n<head>\n${content}\n</head>${rest}\n</html>`

      return `${doctype}\n<html>\n<head>\n${content}\n</head>\n<body>${rest}\n</body>\n</html>`
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
${content}
</head>
<body>
${html}
</body>
</html>`
  }

  private _injectBodyEndContent(html: string, content: string) {
    return /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, () => `${content}\n</body>`)
      : `${html}\n${content}`
  }

  private _bindMessageHandler(webviewView: vscode.WebviewPanel, callback: (data: TMessage) => void) {
    webviewView.webview.onDidReceiveMessage((data: TMessage) => {
      callback(data)
      this.onMessage?.(data)
    })
  }

  private _hasCspMeta(html: string) {
    return html.match(/<meta\b[^>]*>/gi)?.some(tag => this._isCspMeta(tag)) ?? false
  }

  private _removeCspMeta(html: string) {
    return html.replace(/<meta\b[^>]*>/gi, tag => this._isCspMeta(tag) ? '' : tag)
  }

  private _isCspMeta(tag: string) {
    return /\bhttp-equiv\s*=\s*(?:"\s*content-security-policy\s*"|'\s*content-security-policy\s*'|content-security-policy\b)/i.test(tag)
  }

  private _rewriteHtmlResources(html: string, webview: vscode.Webview) {
    let output = ''
    let index = 0

    while (index < html.length) {
      const tagStart = html.indexOf('<', index)
      if (tagStart === -1)
        return output + html.slice(index)

      output += html.slice(index, tagStart)

      if (html.startsWith('<!--', tagStart)) {
        const commentEnd = html.indexOf('-->', tagStart + 4)
        if (commentEnd === -1)
          return output + html.slice(tagStart)
        output += html.slice(tagStart, commentEnd + 3)
        index = commentEnd + 3
        continue
      }

      const tagEnd = this._findHtmlTagEnd(html, tagStart)
      if (tagEnd === -1)
        return output + html.slice(tagStart)

      const tag = html.slice(tagStart, tagEnd + 1)
      const tagName = this._getHtmlTagName(tag)
      output += tagName && !/^<\s*\//.test(tag)
        ? this._rewriteHtmlTag(tag, tagName, webview)
        : tag
      index = tagEnd + 1

      if (tagName === 'style' && !/^<\s*\//.test(tag)) {
        const closingStyleTag = html.slice(index).match(/<\/style\s*>/i)
        if (closingStyleTag?.index !== undefined) {
          const styleEnd = index + closingStyleTag.index
          output += this._rewriteCssUrls(html.slice(index, styleEnd), webview)
          output += closingStyleTag[0]
          index = styleEnd + closingStyleTag[0].length
        }
      }
    }

    return output
  }

  private _rewriteHtmlTag(tag: string, tagName: string, webview: vscode.Webview) {
    const attrs = this._parseHtmlAttributes(tag)
    const replacements: Array<{ start: number; end: number; value: string }> = []
    const rewriteAttr = (name: string, rewrite: (value: string) => string) => {
      const attr = attrs.find(attr => attr.name === name)
      if (!attr || attr.value === undefined)
        return

      const value = rewrite(attr.value)
      if (value !== attr.value) {
        replacements.push({
          start: attr.valueStart,
          end: attr.valueEnd,
          value: this._escapeHtmlAttribute(value),
        })
      }
    }

    if (['script', 'img', 'source', 'video', 'audio', 'track', 'iframe'].includes(tagName))
      rewriteAttr('src', value => this._rewriteHtmlResourceValue(value, webview))

    if (['img', 'source'].includes(tagName))
      rewriteAttr('srcset', value => this._rewriteSrcset(value, webview))

    if (tagName === 'link' && this._isResourceLinkTag(attrs))
      rewriteAttr('href', value => this._rewriteHtmlResourceValue(value, webview))

    rewriteAttr('style', value => this._rewriteCssUrls(value, webview))

    return this._applyHtmlAttributeReplacements(tag, replacements)
  }

  private _findHtmlTagEnd(html: string, start: number) {
    let quote = ''
    for (let index = start; index < html.length; index++) {
      const char = html[index]
      if (quote) {
        if (char === quote)
          quote = ''
        continue
      }

      if (char === '"' || char === '\'') {
        quote = char
        continue
      }

      if (char === '>')
        return index
    }

    return -1
  }

  private _getHtmlTagName(tag: string) {
    return tag.match(/^<\s*\/?\s*([a-z0-9:-]+)/i)?.[1].toLowerCase()
  }

  private _parseHtmlAttributes(tag: string) {
    const attrs: ParsedHtmlAttribute[] = []
    const tagOpen = tag.match(/^<\s*\/?\s*[^\s/>]+/)
    if (!tagOpen)
      return attrs

    let index = tagOpen[0].length
    while (index < tag.length) {
      while (/\s/.test(tag[index]))
        index++

      if (!tag[index] || tag[index] === '/' || tag[index] === '>')
        break

      const nameStart = index
      while (tag[index] && !/[\s=/>]/.test(tag[index]))
        index++

      const name = tag.slice(nameStart, index).toLowerCase()
      while (/\s/.test(tag[index]))
        index++

      if (tag[index] !== '=') {
        attrs.push({ name, valueStart: index, valueEnd: index })
        continue
      }

      index++
      while (/\s/.test(tag[index]))
        index++

      let valueStart = index
      let valueEnd = index
      if (tag[index] === '"' || tag[index] === '\'') {
        const quote = tag[index]
        valueStart = ++index
        while (tag[index] && tag[index] !== quote)
          index++
        valueEnd = index
        if (tag[index] === quote)
          index++
      }
      else {
        valueStart = index
        while (tag[index] && !/[\s>]/.test(tag[index]))
          index++
        valueEnd = index
      }

      attrs.push({
        name,
        value: tag.slice(valueStart, valueEnd),
        valueStart,
        valueEnd,
      })
    }

    return attrs
  }

  private _applyHtmlAttributeReplacements(tag: string, replacements: Array<{ start: number; end: number; value: string }>) {
    return replacements
      .sort((a, b) => b.start - a.start)
      .reduce((rewritten, replacement) => {
        return `${rewritten.slice(0, replacement.start)}${replacement.value}${rewritten.slice(replacement.end)}`
      }, tag)
  }

  private _rewriteHtmlResourceValue(value: string, webview: vscode.Webview) {
    const leadingWhitespace = value.match(/^\s*/)?.[0] || ''
    const trailingWhitespace = value.match(/\s*$/)?.[0] || ''
    const uri = value.trim()

    if (!this._shouldRewriteLocalResource(uri))
      return value

    return `${leadingWhitespace}${webview.asWebviewUri(this._getMediaUri(uri)).toString()}${trailingWhitespace}`
  }

  private _rewriteSrcset(value: string, webview: vscode.Webview) {
    let output = ''
    let index = 0

    while (index < value.length) {
      const candidateStart = index
      while (/\s/.test(value[index]))
        index++

      const urlStart = index
      const isDataUri = value.slice(index, index + 5).toLowerCase() === 'data:'
      while (
        value[index]
        && (isDataUri ? !/\s/.test(value[index]) : !/[\s,]/.test(value[index]))
      )
        index++
      const urlEnd = index

      while (value[index] && value[index] !== ',')
        index++

      const candidateEnd = index
      const url = value.slice(urlStart, urlEnd)
      output += value.slice(candidateStart, urlStart)
      output += this._rewriteHtmlResourceValue(url, webview)
      output += value.slice(urlEnd, candidateEnd)

      if (value[index] === ',') {
        output += ','
        index++
      }
    }

    return output
  }

  private _rewriteCssUrls(css: string, webview: vscode.Webview) {
    return css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")]*?))\s*\)/gi, (match, doubleQuoted, singleQuoted, unquoted) => {
      const uri = (doubleQuoted ?? singleQuoted ?? unquoted ?? '').trim()
      if (!this._shouldRewriteLocalResource(uri))
        return match

      return `url("${this._escapeCssString(webview.asWebviewUri(this._getMediaUri(uri)).toString())}")`
    })
  }

  private _shouldRewriteLocalResource(uri: string) {
    return Boolean(
      uri
      && !uri.startsWith('#')
      && !uri.startsWith('?')
      && !uri.startsWith('//')
      && !/^[a-z][a-z0-9+.-]*:/i.test(uri),
    )
  }

  private _isResourceLinkTag(attrs: ParsedHtmlAttribute[]) {
    const rel = attrs.find(attr => attr.name === 'rel')?.value
    if (!rel)
      return false

    const resourceRels = new Set([
      'apple-touch-icon',
      'apple-touch-icon-precomposed',
      'icon',
      'manifest',
      'mask-icon',
      'modulepreload',
      'prefetch',
      'preload',
      'stylesheet',
    ])

    return rel.toLowerCase().split(/\s+/).some(value => resourceRels.has(value))
  }

  private _assertExternalResourceAllowed(kind: 'script' | 'style', uri: string, allowedSources: string[]) {
    if (this.csp || !this._isExternalUri(uri) || this._isAllowedExternalResource(uri, allowedSources))
      return

    throw new Error(`External ${kind} source is not allowed by CSP: ${uri}`)
  }

  private _assertSupportedResourceUri(uri: string, kind: string) {
    if (/^\/\//.test(uri))
      throw new Error(`Protocol-relative ${kind} URI is not supported. Use an explicit https:// URL: ${uri}`)

    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) && !this._isExternalUri(uri))
      throw new Error(`Unsupported ${kind} URI scheme: ${uri}`)
  }

  private _assertLocalMediaPath(uri: string, kind: string) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || /^\/\//.test(uri))
      throw new Error(`${kind} must be a path under the media directory: ${uri}`)
  }

  private _assertRelativeExtensionPath(uri: string) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || /^\/\//.test(uri))
      throw new Error(`HTML URL must be a relative extension path: ${uri}`)
  }

  private _isExternalUri(uri: string) {
    try {
      const protocol = new URL(uri).protocol
      return protocol === 'http:' || protocol === 'https:'
    }
    catch {
      return false
    }
  }

  private _isAllowedExternalResource(uri: string, allowedSources: string[]) {
    const parsed = new URL(uri)

    return allowedSources.some((source) => {
      if (source === '*')
        return true

      if (source === parsed.protocol || source === parsed.origin || source === uri)
        return true

      const wildcardSource = source.match(/^(https?:)\/\/\*\.(.+)$/)
      if (wildcardSource) {
        const [, protocol, hostname] = wildcardSource
        return parsed.protocol === protocol && parsed.hostname.endsWith(`.${hostname.replace(/\/$/, '')}`)
      }

      if (!this._isExternalUri(source))
        return false

      const allowed = new URL(source)
      if (allowed.origin !== parsed.origin)
        return false

      const allowedPath = allowed.pathname.endsWith('/') ? allowed.pathname : `${allowed.pathname}/`
      return parsed.pathname === allowed.pathname || parsed.pathname.startsWith(allowedPath)
    })
  }

  private _assertValidCspSourceTokens(optionName: string, sources: string[]) {
    const invalidSource = sources.find(source => /[\s;"<>]/.test(source))
    if (invalidSource)
      throw new Error(`Invalid CSP source token in ${optionName}: ${invalidSource}`)
  }

  private _renderInlineScript(script: string, nonce: string) {
    if (!script)
      return ''

    if (/^<script\b/i.test(script.trim()))
      throw new Error('deferScript accepts JavaScript source only. Use deferScriptUri or options.scripts for script files.')

    return `<script nonce="${nonce}">${this._escapeInlineScriptContent(script)}</script>`
  }

  private _escapeInlineScriptContent(source: string) {
    return source.replace(/<\/script/gi, '<\\/script')
  }

  private _escapeHtmlText(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  private _escapeHtmlAttribute(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  private _escapeCssString(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\a ')
      .replace(/\r/g, '\\d ')
  }

  private _serializeForInlineScript(value: unknown) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
  }
}
