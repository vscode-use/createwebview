import fsp from 'node:fs/promises'
import * as vscode from 'vscode'

export class CreateWebview {
  private webviewView: any
  private _deferScript = ''
  private props: Record<string, any> = {}
  private scriptsPromises: Promise<string>[] = []
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _title: string,
    private readonly _scripts: string | (string | { enforce: 'pre' | 'post'; src: string })[],
    private readonly _styles: string | string[],
    private readonly onMessage: (data: any) => void = () => { },
  ) {
    this._extensionUri = _extensionUri
    this._title = _title
    this._scripts = _scripts
    this._styles = _styles
    this.onMessage = onMessage
  }

  public setProps(props: Record<string, any>) {
    this.props = { ...this.props, ...props }
  }

  public async create(html: string, callback: (data: any) => void = () => { }) {
    const webviewView = vscode.window.createWebviewPanel(
      this._title, // 视图的声明方式
      this._title, // 选项卡标题
      vscode.ViewColumn.One, // 在编辑器中显示的视图位置
      {
        enableScripts: true, // 启用JS,否则内容将被视为静态HTML
        localResourceRoots: [this._extensionUri],
      },
    )
    this.webviewView = webviewView
    webviewView.webview.html = await this._getHtmlForWebview(
      webviewView.webview,
      html,
    )
    webviewView.webview.onDidReceiveMessage((data: any) => {
      callback(data)
      this.onMessage(data)
    })
  }

  public isActive() {
    try {
      if (this.webviewView)
        return this.webviewView.active
    }
    catch (error) {

    }

    return false
  }

  public destory() {
    if (this.webviewView)
      this.webviewView.dispose()
  }

  public deferScript(scripts: string | string[]) {
    this._deferScript
      = typeof scripts === 'string' ? scripts : scripts.join('\n')
  }

  public deferScriptUri(scriptUri: string | string[]) {
    try {
      const uris = typeof scriptUri === 'string' ? [scriptUri] : scriptUri
      this.scriptsPromises.push(...uris.map(uri => fsp.readFile(
        `${this._extensionUri.path}/media/${uri}`
        , 'utf-8')))
    }
    catch (error: any) {
      throw new Error(error.message)
    }
  }

  public postMessage(data: any) {
    if (this.webviewView)
      this.webviewView.postMessage(data)
  }

  private async _getHtmlForWebview(webview: vscode.Webview, html: string) {
    const outerUriReg = /^http[s]:\/\//
    const styles = this._styles
      ? (Array.isArray(this._styles) ? this._styles : [this._styles])
          .map((style) => {
            const styleUri = outerUriReg.test(style)
              ? style
              : webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', style),
              )
            return `<link href="${styleUri}" rel="stylesheet">`
          })
          .join('\n')
      : ''
    const preScripts: string[] = []
    const postScripts: string[] = []
    const scripts = Array.isArray(this._scripts)
      ? this._scripts
      : [this._scripts]

    scripts.forEach((script) => {
      let isPre = false
      if (typeof script !== 'string') {
        isPre = script.enforce === 'pre'
        script = script.src
      }
      const scriptUri = outerUriReg.test(script)
        ? script
        : webview.asWebviewUri(
          vscode.Uri.joinPath(this._extensionUri, 'media', script),
        )
      const _script = script.startsWith('<script')
        ? script
        : `<script src="${scriptUri}"></script>`

      if (isPre)
        preScripts.push(_script)
      else
        postScripts.push(_script)
    })
    const scriptsUri = await Promise.all(this.scriptsPromises).then(scripts =>
      scripts.map(script => `<script>${script.replace('webviewThis', JSON.stringify(this.props))}</script>`),
    )

    return `<!DOCTYPE html>
			<html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${styles}
          ${preScripts.length ? preScripts.join('\n') : ''}
          <title>${this._title}</title>
        </head>
        <body>
          ${html}
        </body>
        ${postScripts.join('\n')}
        ${this._deferScript}
        ${scriptsUri.join('\n')}
			</html>`
  }
}

