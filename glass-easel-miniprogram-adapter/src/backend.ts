import * as glassEasel from 'glass-easel'
import { MiniProgramEnv, StyleIsolation } from '.'
import { CodeSpace } from './space'

/**
 * A backend context that has been associated to an environment
 */
export class AssociatedBackend {
  private _$env: MiniProgramEnv
  /** @internal */
  _$: glassEasel.GeneralBackendContext

  /** @internal */
  constructor(env: MiniProgramEnv, backendContext: glassEasel.GeneralBackendContext) {
    this._$env = env
    this._$ = backendContext
  }

  /**
   * Register a style sheet resource
   *
   * Some backend cannot load style sheet URL.
   * In this cases, the content should be registered here.
   */
  registerStyleSheetContent(url: string, content: any) {
    this._$.registerStyleSheetContent(url, content)
  }

  /**
   * Create a root component in specified backend
   *
   * The component is searched in the `codeSpace` with `url` .
   * If `url` contains "?" params, it will be parsed and try to set to component properties.
   */
  createRoot(
    tagName: string,
    codeSpace: CodeSpace,
    url: string,
    genericTargets?: { [key: string]: string },
  ): Root {
    if (this._$env !== codeSpace._$env)
      throw new Error('The code space is not in the same environment as the backend')
    return new Root(this._$, tagName, codeSpace, url, genericTargets)
  }
}

/**
 * A root component
 */
export class Root {
  private _$comp: glassEasel.GeneralComponent

  /** @internal */
  constructor(
    backendContext: glassEasel.GeneralBackendContext,
    tagName: string,
    codeSpace: CodeSpace,
    url: string,
    genericTargets?: { [key: string]: string },
  ) {
    this._$comp = codeSpace
      .getComponentSpace()
      .createComponentByUrl(tagName, url, genericTargets || null, backendContext)
    if (codeSpace.isMainSpace()) {
      const globalStyleSheet = codeSpace.getStyleSheet('app')
      if (globalStyleSheet !== undefined) {
        const styleIsolation = codeSpace._$styleIsolationMap[this._$comp.is]
        if (
          styleIsolation === StyleIsolation.Isolated ||
          styleIsolation === StyleIsolation.ApplyShared ||
          styleIsolation === StyleIsolation.Shared
        ) {
          backendContext.appendStyleSheetPath(globalStyleSheet, codeSpace._$sharedStyleScope)
        }
      }
    }
    const addStyleSheet = (comp: glassEasel.GeneralComponentDefinition) => {
      const { styleScope } = comp.getComponentOptions()
      const path = codeSpace.getStyleSheet(comp.is)
      if (path !== undefined) {
        backendContext.appendStyleSheetPath(path, styleScope)
      }
    }
    this._$comp.getRootBehavior().getComponentDependencies().forEach(addStyleSheet)
    addStyleSheet(this._$comp.getComponentDefinition())
  }

  /**
   * Get the underlying component
   */
  getComponent(): glassEasel.GeneralComponent {
    return this._$comp
  }

  /**
   * Attach the root component to the backend
   *
   * This component, the `parent` and the `placeholder` MUST be in the same context.
   * The `parent` MUST be a parent node of the `placeholder` .
   */
  attach(parent: glassEasel.GeneralBackendElement, placeholder: glassEasel.GeneralBackendElement) {
    glassEasel.Element.replaceDocumentElement(this._$comp, parent, placeholder)
  }
}
