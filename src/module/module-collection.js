import Module from './module'
import { assert, forEachValue } from '../util'

export default class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }

  get (path) {
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  /**
   * 获取嵌套结构的命名空间
   * @param path
   * @returns {*}
   */
  getNamespace (path) {
    let module = this.root
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  update (rawRootModule) {
    update([], this.root, rawRootModule)
  }

  /**
   * 递归函数: 递推和回归的算法进行注册嵌套的模块
   * @param path
   * @param rawModule
   * @param runtime
   */
  register (path, rawModule, runtime = true) {
    /**
     * 开发环境下, 断言原始模块是否符合标准
     */
    if (__DEV__) {
      assertRawModule(path, rawModule)
    }

    /**
     * 根据原始模块, 构造出新模块的实例对象
     */
    const newModule = new Module(rawModule, runtime)

    // path的作用就是如果存在 modules的情况下, path主要存放 modules以及递归modules的子项目和父节点的路径关系
    // path.lenght === 0 的情况是根模块注册的情况下
    if (path.length === 0) {
      this.root = newModule
    } else {
      // path 最多有两个值
      // path 有多个的情况下, 只取第一个, 第一个为父模块的名字, 第二个为子模块的名字
      // 单链表结构
      // parentModule -> ChildModule -> ChildChildModule
      // 组合模式
      const parent = this.get(path.slice(0, -1))
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules
    // 递归注册嵌套模块, 创建一个单链表的数据结构, 一层嵌套一层的关系
    // _children 就是单链表数据结构的指针, 指向下一个 module的节点
    // 而且 module 构造器属于一个组合模式
    // 无需关系创建的 module 是父节点还是子节点, 结构和方法都是一样的

    // 如果原始模块存在 modules 属性, 且这个属性是一个对象
    if (rawModule.modules) {
      // 和根原始模块一样的结构, 和 Store 构造器的选项对象一样 rawChildModule
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        // 嵌套的模块的 path 路径为
        // ['Parent', 'Child1', 'Child1Child']
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }

  /**
   * 卸载已注册的模块
   * @param path
   */
  unregister (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    const child = parent.getChild(key)

    if (!child) {
      if (__DEV__) {
        console.warn(
          `[vuex] trying to unregister module '${key}', which is ` +
          `not registered`
        )
      }
      return
    }

    if (!child.runtime) {
      return
    }

    parent.removeChild(key)
  }

  /**
   * 根据 path 获取已经注册的模块
   * @param path
   * @returns {boolean}
   */
  isRegistered (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]

    return parent.hasChild(key)
  }
}

/**
 * 更新已注册的模块
 * @param path
 * @param targetModule
 * @param newModule
 */
function update (path, targetModule, newModule) {
  if (__DEV__) {
    assertRawModule(path, newModule)
  }

  // update target module
  targetModule.update(newModule)

  /**
   * 如果你需要更新的模块有子模块, 需要进行递归 + 回归方式的更新
   * newModule 更新的 modules 是建立在 targetModule 的 modules的基础上
   */
  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
        if (__DEV__) {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
            'manual reload is needed'
          )
        }
        return
      }
      /**
       * path
       * 需要被更新的子模块的 module 实例
       * 更新为最新的子模块的对象
       */
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      )
    }
  }
}

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
}

/**
 * actions 的用法两种
 *
 * 1. actions: {
 *      add() {}
 *    }
 *
 * 2. actions: {
 *      add: {
 *        handler() {
 *
 *        },
 *        root: true | false 用来指定该 action 没有使用命名空间
 *      }
 *    }
 */
const objectAssert = {
  assert: value => {
    return typeof value === 'function' ||
        (typeof value === 'object' && typeof value.handler === 'function')
  },
  expected: 'function or object with "handler" function'
}

/**
 * 对 Store 选项对象中的
 *  - getters 派生一些状态
 *  - mutations 状态更新
 *  - actions 提交 mutation, 包含异步操作
 *
 *  因为 getters、mutations 和 actions 都是一个对象
 */
const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
}

function assertRawModule (path, rawModule) {
  /**
   * key: assertTypes 中的 key值
   */
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return

    const assertOptions = assertTypes[key]

    /**
     * value - Function
     * type - String
     */
    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),

        /**
           * 如果断言失败, mutations 或 getters 的下 key: value 映射中,
           * value 不为函数的情况下
           */

        // 抛出断言失败的消息
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      )
    })
  })
}

function makeAssertionMessage (path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`
  }
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
