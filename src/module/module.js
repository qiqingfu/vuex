import { forEachValue } from '../util'

// Base data struct for store's module, package with some attribute and method
/**
 * 单链表数据结构的节点
 *
 * _children 就是一个指针
 */
export default class Module {
  constructor (rawModule, runtime) {
    this.runtime = runtime
    // Store some children item
    this._children = Object.create(null)
    // Store the origin module object which passed by programmer
    this._rawModule = rawModule
    const rawState = rawModule.state

    // Store the origin module's state
    /**
     * Store 构造器选项中的 state 可以是一个对象或者是一个函数的引用
     * 如果是一个函数, 在内部会进行调用并且以调用函数的返回值作为 state 数据
     * @type {*|{}}
     */
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }

  /**
   * 获取模块的命名空间属性
   * @returns {boolean}
   */
  get namespaced () {
    return !!this._rawModule.namespaced
  }

  /**
   * 添加子项目
   * @param key
   * @param module
   */
  addChild (key, module) {
    this._children[key] = module
  }

  /**
   * 移除子项目
   * @param key
   */
  removeChild (key) {
    delete this._children[key]
  }

  /**
   * 获取子项目
   * @param key
   * @returns {*}
   */
  getChild (key) {
    return this._children[key]
  }

  /**
   * 子项目是否存在
   * @param key
   * @returns {boolean}
   */
  hasChild (key) {
    return key in this._children
  }

  /**
   * 对 module 进行更新
   * 只更新 namesspaced、actions、mutations、getters 更新
   * @param rawModule
   */
  update (rawModule) {
    this._rawModule.namespaced = rawModule.namespaced
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters
    }
  }

  /**
   * 遍历每一个子项目
   * fn(module, key)
   * @param fn
   */
  forEachChild (fn) {
    forEachValue(this._children, fn)
  }

  /**
   * 遍历 getters 对象中的 key 和 value
   * @param fn
   */
  forEachGetter (fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn)
    }
  }

  /**
   * 遍历 actions 对象中的 key 和 value
   * @param fn
   */
  forEachAction (fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn)
    }
  }

  /**
   * 遍历 mutations 对象中的 key 和 value
   * @param fn
   */
  forEachMutation (fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn)
    }
  }
}
