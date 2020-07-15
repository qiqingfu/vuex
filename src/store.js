import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert, partial } from './util'

let Vue // bind on install

export class Store {
  constructor (options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    if (__DEV__) {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      assert(this instanceof Store, `store must be called with the new operator.`)
    }

    const {
      plugins = [],
      strict = false
    } = options

    // store internal state
    this._committing = false
    this._actions = Object.create(null)
    this._actionSubscribers = []
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    this._modules = new ModuleCollection(options)
    this._modulesNamespaceMap = Object.create(null)
    this._subscribers = []
    this._watcherVM = new Vue()
    this._makeLocalGettersCache = Object.create(null)

    // bind commit and dispatch to self
    /**
     * 重写原型上的方法
     * 这样开发中使用时,commit 或 dispatch 是直接调用的, 所以 this指向 undefined(严格模式)或 window对象
     * 为了让开发者直接调用, 并且 commit 和 dispatch 仍然指向 store 这个实例对象
     * @type {Store}
     */
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    this.strict = strict

    /**
     * root模块的 state 对象
     */
    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    /**
     * this 当前的 store 实例对象
     * state 当前 root 模块的 state
     * path
     * root 模块(包含所有子模块)
     */
    installModule(this, state, [], this._modules.root)

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    // 初始化负责响应性的存储虚拟机
    // 将 _wrappedGetters 注册为计算属性
    /**
     * this - Store 构造器实例
     * state - 模块的 state 原始数据属性
     */
    resetStoreVM(this, state)

    // apply plugins
    plugins.forEach(plugin => plugin(this))

    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
    /**
     * 开启时光旅行
     */
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }

  /**
   * 属性描述符:
   *  - 数据描述符
   *  - 存取描述符
   *
   *  存取描述符
   *  getter 函数 和 setter 函数所描述的属性
   */
  get state () {
    return this._vm._data.$$state
  }

  /**
   * 禁止直接修改 state 对象
   * @param v
   */
  set state (v) {
    if (__DEV__) {
      assert(false, `use store.replaceState() to explicit replace store state.`)
    }
  }

  /**
   * 提交 mutation
   * @param _type
   * @param _payload
   * @param _options
   */
  commit (_type, _payload, _options) {
    // check object-style commit
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options)

    const mutation = { type, payload }
    const entry = this._mutations[type]
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown mutation type: ${type}`)
      }
      return
    }
    this._withCommit(() => {
      entry.forEach(function commitIterator (handler) {
        handler(payload)
      })
    })

    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state))

    if (
      __DEV__ &&
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      )
    }
  }

  dispatch (_type, _payload) {
    // check object-style dispatch
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload)

    const action = { type, payload }
    const entry = this._actions[type]
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown action type: ${type}`)
      }
      return
    }

    /**
     * _actionSubscribers 里面存放的是什么东西?
     * 在 action 异步请求之前调用 before钩子
     */
    try {
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state))
    } catch (e) {
      if (__DEV__) {
        console.warn(`[vuex] error in before action subscribers: `)
        console.error(e)
      }
    }

    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload)

    return new Promise((resolve, reject) => {
      result.then(res => {
        /**
         * 在 action 异步请求结果响应之后, 调用after钩子
         * 难道是为了时光旅行记录吗?
         */
        try {
          this._actionSubscribers
            .filter(sub => sub.after)
            .forEach(sub => sub.after(action, this.state))
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in after action subscribers: `)
            console.error(e)
          }
        }
        resolve(res)
      }, error => {
        /**
         * 异步请求出错调用对应的 _actionSubscribers 对应的 error 钩子
         */
        try {
          this._actionSubscribers
            .filter(sub => sub.error)
            .forEach(sub => sub.error(action, this.state, error))
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in error action subscribers: `)
            console.error(e)
          }
        }
        reject(error)
      })
    })
  }

  /**
   * 订阅 store 的 mutation
   * fn 会在每个 mutation 完成后调用, 接受 mutation 和 经过 mutation 后的状态作为参数
   * @param fn
   * @param options
   */
  subscribe (fn, options) {
    return genericSubscribe(fn, this._subscribers, options)
  }

  /**
   * 订阅 store 的action。fn 会在每个 action 分发的时候调用并接受 action 描述和当前的 store的state
   * @param fn
   * @param options
   */
  subscribeAction (fn, options) {
    const subs = typeof fn === 'function' ? { before: fn } : fn
    return genericSubscribe(subs, this._actionSubscribers, options)
  }

  watch (getter, cb, options) {
    if (__DEV__) {
      assert(typeof getter === 'function', `store.watch only accepts a function.`)
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }

  /**
   * 替换 store 的根状态, 仅用于状态合并或时光旅行调试
   * @param state
   */
  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state
    })
  }

  /**
   * 模块动态注册
   * @param path
   * @param rawModule
   * @param options
   */
  registerModule (path, rawModule, options = {}) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
      assert(path.length > 0, 'cannot register the root module by using registerModule.')
    }

    /**
     * 注册嵌套 modules, 建立父子模块之间的关系
     */
    this._modules.register(path, rawModule)
    installModule(this, this.state, path, this._modules.get(path), options.preserveState)
    // reset store to update getters...
    resetStoreVM(this, this.state)
  }

  /**
   * 动态卸载模块
   * @param path
   */
  unregisterModule (path) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    this._modules.unregister(path)
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1))
      Vue.delete(parentState, path[path.length - 1])
    })
    resetStore(this)
  }

  /**
   * 检查该模块的名字是否已注册
   * @param path - String | Array<string>
   * @return {boolean}
   */
  hasModule (path) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    return this._modules.isRegistered(path)
  }

  /**
   * 热更新替换 mutation 和 action
   * @param newOptions
   */
  hotUpdate (newOptions) {
    this._modules.update(newOptions)
    resetStore(this, true)
  }

  /**
   * 关于 commit 提交的一个操作的切片
   * 在修改 state 之前, 将 _committing 设置为 true
   * 修改 state 之后, 将 _committing 设置为 false
   * @param fn
   * @private
   */
  _withCommit (fn) {
    const committing = this._committing
    this._committing = true
    fn()
    this._committing = committing
  }
}

function genericSubscribe (fn, subs, options) {
  if (subs.indexOf(fn) < 0) {
    options && options.prepend
      ? subs.unshift(fn)
      : subs.push(fn)
  }
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

function resetStore (store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}

function resetStoreVM (store, state, hot) {
  const oldVm = store._vm

  // bind store public getters
  store.getters = {}
  // reset local getters cache
  // 重置本地 getters 缓存
  store._makeLocalGettersCache = Object.create(null)
  // wrappedGetters 注册的 getters 函数
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    // 使用计算来利用其延迟缓存机制
    // 直接内联函数的使用将导致关闭保留 oldVm
    // 使用局部返回函数, 仅保留在闭包环境中保留的参数
    /**
     * function (fn, store) {
     *   return function () {
     *     return fn(store)
     *   }
     * }
     */
    computed[key] = partial(fn, store)
    /**
     * 对 store 实例的 getters 属性设置拦截
     *
     * 通过 rootGetters['user/count'] 读取 user module 下 getters计算函数的count值
     */
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key], // 获取的是一个函数
      enumerable: true // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent
  // 取消 Vue 所有的日志与警告
  Vue.config.silent = true
  /**
   * store 的实例上挂载一个 _vm 实例对象
   * 将 state 作为响应式的数据
   * 并且通过别的对象属性 getters 函数来读取
   *
   * 将 state 中的 getters 函数包装成 vue 的 computed 计算属性
   *
   * {
   *   data: {
   *     $$state: {
   *       name: "zs",
   *       "user": {
   *         n: 1
   *       }
   *     }
   *   }
   * }
   */
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  // enable strict mode for new vm
  // 如果开启了严格模式
  // 严格模式下, 无论何时发生状态变更且不是由 mutation 函数引起的, 将会抛出错误。
  // 这能保证所有的状态变更都能被调试工具跟踪到
  if (store.strict) {
    enableStrictMode(store)
  }

  /**
   * 如果 oldVm实例存在, 并且动态模块注册时, 将 preserveState 设置为 true
   */
  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    Vue.nextTick(() => oldVm.$destroy())
  }
}

/**
 *
 * @param store Store 实例对象
 * @param rootState 模块的原始数据
 * @param path      命名空间路径
 * @param module    每一个嵌套模块, (从 root 开始)
 * @param hot  动态注册模块时, preserveState 选项的值, 为 true 时, 该模块会被注册
 *             action、mutation、getter 会被添加到 store 中, 但 state 不会
 */
function installModule (store, rootState, path, module, hot) {
  // 只有初始化根模块时, path 为空数组
  const isRoot = !path.length

  // module_collection 类原型上的方法 getNamespace
  const namespace = store._modules.getNamespace(path)

  // register in namespace map
  // 在命名空间映射中注册
  // 如果当前模块启用了命名空间
  if (module.namespaced) {
    // 对重复的命名空间做了处理
    if (store._modulesNamespaceMap[namespace] && __DEV__) {
      console.error(`[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join('/')}`)
    }
    // 在store对象中缓存命名空间的实例
    store._modulesNamespaceMap[namespace] = module
  }

  // set state
  if (!isRoot && !hot) {
    /**
     * rootState 原始的数据状态
     * 获取嵌套状态
     */
    const parentState = getNestedState(rootState, path.slice(0, -1))

    // root state moduleName is undefined
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      if (__DEV__) {
        // 同名
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join('.')}"`
          )
        }
      }
      /**
       * {
       *   state: {
       *     user: {
       *       name: "zs"
       *     }
       *   }
       * }
       */
      Vue.set(parentState, moduleName, module.state)
    })
  }

  /**
   * 每一个 module 都会创建一个 local
   * 会被保存在闭包环境中
   */
  const local = module.context = makeLocalContext(store, namespace, path)

  /**
   * 遍历当前 module 的所有 mutation函数 和 key
   *
   * mutation - Function
   * key - String
   */
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  /**
   * 遍历当前 module 的所有 mutations函数和 key
   * action - Function | Object
   * key - String
   */
  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    // handler 使用者提供的函数
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  /**
   * 遍历当前 module 的 所有的 getters函数和key
   * getters - Function
   * key - String
   */
  module.forEachGetter((getter, key) => {
    // 如果使用命名空间, 则进行整合命名空间和key
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })

  /**
   * 递归注册 module
   * child - module
   * key 模块名
   *
   * 遍历获取当前 module 下的所有子module
   */
  module.forEachChild((child, key) => {
    /**
     * store - Store的实例对象, 通过 store 可以获取到根节点的 getters和state
     * rootState - 根module的用户原始的 state 对象
     * key - 子模块的名字(cart|usr)
     * child - { state: {count: 1} }
     * hot - false
     *
     * {
     *   modules: {
     *     cart: { state: {count: 1} },
     *     user: {}
     *   }
     * }
     */
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 * 进行本地化的调度，提交，获取器和状态。如果没有名称空间，请使用根名称空间
 *
 * store - 当前的 store 实例对象
 * namespace - 当前模块是否启用命名空间  'user/'
 * path
 */
function makeLocalContext (store, namespace, path) {
  // noNamespace 如果没有启用命名空间, 则为 true
  // 或者为 root 模块
  // 保存在闭包环境中的命名空间
  const noNamespace = namespace === ''

  /**
   * 本地的提交和派发
   *
   * store.dispatch
   * store.commit
   * 就是在 Store 构造函数中被重写的函数
   */
  const local = {
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      /**
       * 如果没有使用 options 或者 root 不为 true
       * 将 type 和当前模块的空间命名进行拼接, 调用对应命名空间下的 action
       */
      if (!options || !options.root) {
        type = namespace + type
        if (__DEV__ && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }

      return store.dispatch(type, payload)
    },

    /**
     * {
     *   actions: {
     *     getUser({ commit }, payLoad) {
     *       commit(命名空间模块下的 mutations 对应的函数, payload)
     *     }
     *   }
     * }
     *
     * noNamespace 为 false的时候, 则为 module 模块下的 action 异步请求之后
     * 通过调用当前 module._context 的 commit 方法
     */
    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (__DEV__ && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
          return
        }
      }

      store.commit(type, payload, options)
    }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  // getter和state对象必须延迟获取，因为它们会被vm update更改
  // 给 local 对象新增了 getters 和 state 属性
  // 并且, 在这两个属性取值的时候进行了 拦截处理
  // 属性描述符
  /**
   * 如果是一个命名空间, 访问 getters => makeLocalGetters 返回的一个对象
   * 如果不是一个命名空间, getters 直接访问的是 root 下的 getters
   */
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      // 获取对应命名空间下的 state 数据
      get: () => getNestedState(store.state, path)
    }
  })

  /**
   * local 对象有如下属性
   *
   * commit
   * dispatch
   * getters
   * state
   */

  return local
}

/**
 *
 * @param {Object} store
 * @param {String} namespace
 * 获取本地的 getters 计算值
 * 使本地的 getters 缓存
 *
 * store.getters 什么时候初始化的值
 */
function makeLocalGetters (store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    /**
     * gettersProxy getters 的代理对象
     * 主要用于 getters 之间互相调用
     *
     * {
     *   getters: {
          reverseLinks (state, getters) {

            getters = {
            reverseLinks: 结果
            agePlus: 结果
            }

            return state.links.reverse()
          },
          agePlus (state) {
            return state.age + 1
          }
        }
     * }
     * @type {{}}
     */
    const gettersProxy = {}
    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
      // skip if the target getter is not match this namespace
      // 如果目标获取器与此空间名称不匹配, 则跳过
      if (type.slice(0, splitPos) !== namespace) return

      // extract local getter type
      const localType = type.slice(splitPos)

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      })
    })
    store._makeLocalGettersCache[namespace] = gettersProxy
  }

  return store._makeLocalGettersCache[namespace]
}

/**
 * 注册 mutations
 * @param store  Store 的实例对象
 * @param type   处理了使用命名空间情况的 key `cart/count`
 * @param handler mutations中的函数,使用者提供的
 * @param local 本地的调度对象, 其中包括commit、dispatch、getters、state
 */
function registerMutation (store, type, handler, local) {
  // 在 _mutations中每一个 key 都对应一个数组
  const entry = store._mutations[type] || (store._mutations[type] = [])
  // 注册 mutations
  // 闭包环境
  /**
   * _mutations: {
   *   key: [fn, fn, fn]
   * }
   */
  entry.push(function wrappedMutationHandler (payload) {
    /**
     * 在用户提供的 mutations 中的函数
     * mutations: {
     *   change: function (state, payload) {
     *     state = local.state
     *     this = store
     *   }
     * }
     */
    handler.call(store, local.state, payload)
  })
}

/**
 * 注册 actions
 * @param store Store 构造器实例
 * @param type  提交的类型
 * @param handler 提交的函数
 * @param local 本地的调度对象, 其中包括commit、dispatch、getters、state
 */
function registerAction (store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = [])
  /**
   * 包装的动作处理程序
   * actions: {
   *   add: {
   *     handler({ dispatch, commit, getters, state, rootGetters, rootState }, payload) {
   *        return new Promise((resolve, reject) => {
   *        // 异步请求
   *          ajax()
   *            .then((result) => {
   *               提交 mutations
   *               commit()
   *               resolve(result)
   *            })
   *            .catch(err => reject(err))
   *        })
   *     }
   *   }
   * }
   */
  entry.push(function wrappedActionHandler (payload) {
    // actions 中使用者返回的 Promise 对象
    // 给包装了一层
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload)

    /**
     * 如果 actions 中的 handler 返回的不是一个 Promise, 则会被包装成一个 Promise
     */
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    /**
     * store._devtollHook是什么意思?
     * 是时光旅行的调试工具提供的钩子吗?
     */
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}

/**
 *
 * @param store Store 构造器实例对向
 * @param type 派生的名字
 * @param rawGetter 派生的 handler, 如果Vue中 computed中的函数
 * @param local 本地的调度对象, 其中包括commit、dispatch、getters、state
 */
function registerGetter (store, type, rawGetter, local) {
  // 一个 module 中不可以重复定义 getters
  if (store._wrappedGetters[type]) {
    if (__DEV__) {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  store._wrappedGetters[type] = function wrappedGetter (store) {
    /**
     * 返回 rawGetter的计算结果
     *
     * getters: {
     *   count(state, getters, rootState, rootGetters) {
     *     return state.todos.filter(todo => todo.achieve)
     *   }
     * }
     *
     * 也可以返回一个函数
     * getters: {
     *   count(state, getters, rootState, rootGetters) {
     *     return function (status) {
     *       // TODO
     *     }
     *   }
     * }
     */

    // 返回使用者的计算结果或者是一个函数
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}

/**
 * _committing 的作用
 * 在 mutations 之前将 _committing 设置为 true
 * mutations 之后将 _committing 设置为 false
 * 在严格模式下, 如果被观测的 state 状态直接被修改和赋值, 那么 _committing 为 false, 就会抛出警告
 * @param store
 */
function enableStrictMode (store) {
  store._vm.$watch(function () { return this._data.$$state }, () => {
    if (__DEV__) {
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
    }
  }, { deep: true, sync: true })
}

/**
 * 获取嵌套状态
 * @param state 根(root) 的 state
 * @param path  嵌套状态模块的路径
 * @returns {*}
 */
function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

/**
 * 统一对象样式
 * @param type
 * @param payload
 * @param options
 * @return {{payload: ({type}|*), options: *, type: *}}
 */
function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }

  if (__DEV__) {
    assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
  }

  return { type, payload, options }
}

export function install (_Vue) {
  if (Vue && _Vue === Vue) {
    if (__DEV__) {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}
