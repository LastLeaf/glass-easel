import { VirtualNode } from './virtual_node'
import { Behavior, GeneralBehavior } from './behavior'
import { Component, GeneralComponent } from './component'
import { Element } from './element'
import { safeCallback, triggerWarning } from './func_arr'
import { TraitBehavior } from './trait_behaviors'

export const enum RelationType {
  Ancestor = 0,
  Descendant,
  ParentNonVirtualNode,
  ChildNonVirtualNode,
  ParentComponent,
  ChildComponent,
}

const RELATION_TYPE_COUNT = 6

export type RelationListener = (target: unknown) => void

export type RelationFailedListener = () => void

export type RelationDefinition = {
  target:
    | string
    | GeneralBehavior
    | TraitBehavior<{ [x: string]: unknown }, { [x: string]: unknown }>
  domain: string | null
  type: RelationType
  linked: RelationListener | null
  linkChanged: RelationListener | null
  unlinked: RelationListener | null
  linkFailed: RelationFailedListener | null
}

export type RelationDefinitionGroup = {
  definitions: RelationDefinition[][]
  keyMap: { [key: string | symbol]: [RelationType, number] }
}

export const generateRelationDefinitionGroup = (relations?: {
  [key: string]: RelationDefinition
}): RelationDefinitionGroup | null => {
  if (relations === undefined) return null
  const group = {
    definitions: new Array(RELATION_TYPE_COUNT) as RelationDefinition[][],
    keyMap: Object.create(null) as { [key: string]: [RelationType, number] },
  } as RelationDefinitionGroup
  const defs = group.definitions
  const keyMap = group.keyMap
  const keys = Object.keys(relations)
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]!
    const relation = relations[key]!
    const relationType = relation.type
    if (defs[relationType]) {
      keyMap[key] = [relationType, defs[relationType]!.length]
      defs[relationType]!.push(relation)
    } else {
      keyMap[key] = [relationType, 0]
      defs[relationType] = [relation]
    }
  }
  return group
}

export const cloneRelationDefinitionGroup = (
  group: RelationDefinitionGroup,
): RelationDefinitionGroup => {
  const newGroup = {
    definitions: group.definitions.slice(),
    keyMap: Object.assign(Object.create(null), group.keyMap) as {
      [key: string]: [RelationType, number]
    },
  }
  return newGroup
}

export class Relation {
  private _$comp: GeneralComponent
  private _$group: RelationDefinitionGroup | null
  private _$sharedGroup: boolean
  private _$links: ({ target: GeneralComponent; def: RelationDefinition } | null)[][]

  constructor(associatedComponent: GeneralComponent, group: RelationDefinitionGroup | null) {
    this._$comp = associatedComponent
    const links = new Array(RELATION_TYPE_COUNT) as ({
      target: GeneralComponent
      def: RelationDefinition
    } | null)[][]
    if (group) {
      for (let type = 0; type < RELATION_TYPE_COUNT; type += 1) {
        const definitions = group.definitions[type]
        if (definitions) {
          const link = new Array(definitions.length) as ({
            target: GeneralComponent
            def: RelationDefinition
          } | null)[]
          for (let i = 0; i < definitions.length; i += 1) {
            link[i] = null
          }
          links[type] = link
        }
      }
    }
    this._$group = group
    this._$sharedGroup = true
    this._$links = links
  }

  add(relation: RelationDefinition): symbol {
    if (this._$sharedGroup) {
      this._$sharedGroup = false
      const group = this._$group
      if (group) {
        this._$group = {
          definitions: group.definitions.slice(),
          keyMap: Object.assign(Object.create(null), group.keyMap) as {
            [key: string]: [RelationType, number]
          },
        }
      } else {
        this._$group = {
          definitions: new Array(RELATION_TYPE_COUNT) as RelationDefinition[][],
          keyMap: Object.create(null) as { [key: string]: [RelationType, number] },
        }
      }
    }
    const key = Symbol('')
    const defs = this._$group!.definitions
    const keyMap = this._$group!.keyMap
    const relationType = relation.type
    if (defs[relationType]) {
      keyMap[key] = [relationType, defs[relationType]!.length]
      defs[relationType]!.push(relation)
    } else {
      keyMap[key] = [relationType, 0]
      defs[relationType] = [relation]
    }
    const linksGroup = this._$links
    if (linksGroup[relationType] === undefined) {
      linksGroup[relationType] = [null]
    } else {
      linksGroup[relationType]!.push(null)
    }
    return key
  }

  triggerLinkEvent(
    parentType:
      | RelationType.ParentComponent
      | RelationType.ParentNonVirtualNode
      | RelationType.Ancestor,
    isDetach: boolean,
  ) {
    const comp = this._$comp
    const linksGroup = this._$links
    const selfDefs = this._$group?.definitions[parentType]
    if (!selfDefs) return
    for (let i = 0; i < selfDefs.length; i += 1) {
      const links = linksGroup[parentType]!
      const oldLink = links[i]!
      let newLink: { target: GeneralComponent; def: RelationDefinition } | null = null
      const def = selfDefs[i]!
      let parentBeheviorTest:
        | GeneralBehavior
        | TraitBehavior<{ [x: string]: unknown }, { [x: string]: unknown }>
        | null
      if (def.target instanceof Behavior || def.target instanceof TraitBehavior) {
        parentBeheviorTest = def.target
      } else {
        const space = comp.getRootBehavior().ownerSpace
        if (space) {
          parentBeheviorTest = space._$getBehavior(def.target, def.domain) || null
        } else {
          parentBeheviorTest = null
        }
      }
      if (parentBeheviorTest) {
        const parentBehevior = parentBeheviorTest
        if (!isDetach) {
          let cur: Element = comp
          for (;;) {
            const next = cur.parentNode
            if (!next) break
            cur = next
            if (cur instanceof VirtualNode) {
              continue
            }
            if (cur instanceof Component) {
              if (cur.hasBehavior(parentBehevior)) {
                const parentRelation = cur._$relation
                if (parentRelation) {
                  let rt
                  if (parentType === RelationType.ParentComponent) {
                    rt = RelationType.ChildComponent
                  } else if (parentType === RelationType.Ancestor) {
                    rt = RelationType.Descendant
                  } else {
                    rt = RelationType.ChildNonVirtualNode
                  }
                  const parentDefs = parentRelation._$group?.definitions[rt]
                  if (parentDefs) {
                    for (let j = 0; j < parentDefs.length; j += 1) {
                      const def = parentDefs[j]!
                      let requiredBehavior:
                        | GeneralBehavior
                        | TraitBehavior<{ [x: string]: unknown }, { [x: string]: unknown }>
                        | null
                      if (def.target instanceof Behavior || def.target instanceof TraitBehavior) {
                        requiredBehavior = def.target
                      } else {
                        const space = cur.getRootBehavior().ownerSpace
                        if (space) {
                          requiredBehavior = space._$getBehavior(def.target, def.domain) || null
                        } else {
                          requiredBehavior = null
                        }
                      }
                      if (requiredBehavior && this._$comp.hasBehavior(requiredBehavior)) {
                        newLink = {
                          target: cur as GeneralComponent,
                          def,
                        }
                        break
                      }
                    }
                  }
                }
              }
              if (parentType === RelationType.ParentComponent) break
            }
            if (parentType === RelationType.ParentNonVirtualNode) break
          }
        }
      }
      links[i] = newLink
      if (oldLink) {
        const oldTarget = oldLink.target
        const oldDef = oldLink.def
        if (!newLink || oldLink.target !== newLink.target || oldLink.def !== newLink.def) {
          if (oldDef.unlinked) {
            safeCallback(
              'Relation Unlinked Callback',
              oldDef.unlinked,
              oldTarget.getMethodCaller(),
              [comp.getMethodCaller()],
              oldTarget,
            )
          }
          if (def.unlinked) {
            safeCallback(
              'Relation Unlinked Callback',
              def.unlinked,
              comp.getMethodCaller(),
              [oldTarget.getMethodCaller()],
              comp,
            )
          }
        } else {
          if (oldDef.linkChanged) {
            safeCallback(
              'Relation Link Changed Callback',
              oldDef.linkChanged,
              oldTarget.getMethodCaller(),
              [comp.getMethodCaller()],
              oldTarget,
            )
          }
          if (def.linkChanged) {
            safeCallback(
              'Relation Link Changed Callback',
              def.linkChanged,
              comp.getMethodCaller(),
              [oldTarget.getMethodCaller()],
              comp,
            )
          }
        }
      }
      if (newLink) {
        const newTarget = newLink.target
        const newDef = newLink.def
        if (!oldLink || oldLink.target !== newLink.target || oldLink.def !== newLink.def) {
          if (newDef.linked) {
            safeCallback(
              'Relation Linked Callback',
              newDef.linked,
              newTarget.getMethodCaller(),
              [comp.getMethodCaller()],
              newTarget,
            )
          }
          if (def.linked) {
            safeCallback(
              'Relation Linked Callback',
              def.linked,
              comp.getMethodCaller(),
              [newTarget.getMethodCaller()],
              comp,
            )
          }
        }
      }
      if (!isDetach && !newLink && def.linkFailed) {
        safeCallback(
          'Relation Link Failed Callback',
          def.linkFailed,
          comp.getMethodCaller(),
          [],
          comp,
        )
      }
    }
  }

  getLinkedTargets(key: string | symbol): GeneralComponent[] {
    const typeWithIndex = this._$group?.keyMap[key]
    if (!typeWithIndex) {
      triggerWarning(`no relation "${String(key)}" found.`)
      return []
    }
    const [type, index] = typeWithIndex
    if (
      type === RelationType.ParentComponent ||
      type === RelationType.ParentNonVirtualNode ||
      type === RelationType.Ancestor
    ) {
      const link = this._$links[type]?.[index]
      if (link) return [link.target]
      return []
    }
    const ret: GeneralComponent[] = []
    const comp = this._$comp
    const def = this._$group?.definitions[type]?.[index]
    const dfs = (node: Element) => {
      const children = node.childNodes
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i]!
        if (!(child instanceof Element)) continue
        if (child instanceof VirtualNode) {
          dfs(child)
          continue
        }
        if (child instanceof Component) {
          if (child._$relation) {
            let links
            if (type === RelationType.ChildComponent) {
              links = child._$relation._$links[RelationType.ParentComponent]
            } else if (type === RelationType.Descendant) {
              links = child._$relation._$links[RelationType.Ancestor]
            } else {
              links = child._$relation._$links[RelationType.ParentNonVirtualNode]
            }
            if (links) {
              for (let i = 0; i < links.length; i += 1) {
                const link = links[i]!
                if (link && link.target === comp && link.def === def) {
                  ret.push(child as GeneralComponent)
                  break
                }
              }
            }
          }
          if (type === RelationType.Descendant) dfs(child)
        } else {
          if (type === RelationType.ChildComponent || type === RelationType.Descendant) dfs(child)
        }
      }
    }
    dfs(this._$comp)
    return ret
  }
}
