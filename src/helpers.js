import { isObject } from './util'

/**
 * 辅助函数, 帮助生成计算属性, 方面在 vue 文件中访问 state 状态数据
 * Reduce the code which written in Vue.js for getting the state.
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} states # Object's item can be a function which accept state and getters for param, you can do something for state and getters in it.
 * @param {Object}
 *
 * {
 *   key: function,
 *   key1: function,
 *   key2: function
 * }
 */
export const mapState = normalizeNamespace((namespace, states) => {
  const res = {}
  if (__DEV__ && !isValidMap(states)) {
    console.error('[vuex] mapState: mapper parameter must be either an Array or an Object')
  }
  normalizeMap(states).forEach(({ key, val }) => {
    res[key] = function mappedState () {
      /**
       * 拿到 state 的实例对象, 方便后续操作
       */
      let state = this.$store.state
      let getters = this.$store.getters
      /**
       * 如果使用了命名空间, 确保对应命名空间的模块已经注册
       * 并拿到对应命名的 state 和 getters
       */
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapState', namespace)
        if (!module) {
          return
        }
        state = module.context.state
        getters = module.context.getters
      }
      /**
       * mapState('user', {
       *   "name": function (state, getters) {
       *     this -> vm
       *   }
       * })
       *
       * mapState('user', {
       *   "name": "name"
       * })
       */
      /**
       * map 映射的 val 如果是一个函数, 将 state 状态传递给用户自己决定使用什么数据
       * 如果是一个字符串, 则取对应 state 的值
       */
      return typeof val === 'function'
        ? val.call(this, state, getters)
        : state[val]
    }
    // mark vuex getter for devtools
    res[key].vuex = true
  })
  return res
})

/**
 * Reduce the code which written in Vue.js for committing the mutation
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} mutations # Object's item can be a function which accept `commit` function as the first param, it can accept anthor params. You can commit mutation and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
export const mapMutations = normalizeNamespace((namespace, mutations) => {
  const res = {}
  if (__DEV__ && !isValidMap(mutations)) {
    console.error('[vuex] mapMutations: mapper parameter must be either an Array or an Object')
  }
  normalizeMap(mutations).forEach(({ key, val }) => {
    res[key] = function mappedMutation (...args) {
      // Get the commit method from store
      let commit = this.$store.commit
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapMutations', namespace)
        if (!module) {
          return
        }
        commit = module.context.commit
      }
      /**
       * 如果 mapMutations 的 map映射的 val 是函数
       * {
       *   ...mapMutations({
       *     xxx: function (commit) {
       *       // 手动 commit
       *     }
       *   })
       * }
       */
      return typeof val === 'function'
        ? val.apply(this, [commit].concat(args))
        : commit.apply(this.$store, [val].concat(args))
    }
  })
  return res
})

/**
 * Reduce the code which written in Vue.js for getting the getters
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} getters
 * @return {Object}
 */
export const mapGetters = normalizeNamespace((namespace, getters) => {
  const res = {}
  if (__DEV__ && !isValidMap(getters)) {
    console.error('[vuex] mapGetters: mapper parameter must be either an Array or an Object')
  }
  normalizeMap(getters).forEach(({ key, val }) => {
    // The namespace has been mutated by normalizeNamespace
    val = namespace + val
    res[key] = function mappedGetter () {
      // 确保 namespace 模块已经注册了
      if (namespace && !getModuleByNamespace(this.$store, 'mapGetters', namespace)) {
        return
      }
      /**
       * 如果获取的 getters 不存在, 则抛出错误
       */
      if (__DEV__ && !(val in this.$store.getters)) {
        console.error(`[vuex] unknown getter: ${val}`)
        return
      }
      return this.$store.getters[val]
    }
    // mark vuex getter for devtools
    res[key].vuex = true
  })
  return res
})

/**
 * Reduce the code which written in Vue.js for dispatch the action
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} actions # Object's item can be a function which accept `dispatch` function as the first param, it can accept anthor params. You can dispatch action and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 *
 * 减少用 vue.js 编写的用于分派[dispatch]动作的代码
 */
export const mapActions = normalizeNamespace((namespace, actions) => {
  const res = {}
  if (__DEV__ && !isValidMap(actions)) {
    console.error('[vuex] mapActions: mapper parameter must be either an Array or an Object')
  }
  normalizeMap(actions).forEach(({ key, val }) => {
    /**
     * 可以接收参数
     * @param args
     * @returns {*}
     *
     * key 是函数名
     */
    res[key] = function mappedAction (...args) {
      // get dispatch function from store
      // 从 store 获取调度功能
      let dispatch = this.$store.dispatch

      /**
       * 如果使用了命名空间, 则判断对应命名模块是否已经注册
       * 并且取出对应命名空间下的 makeLocalContext 的 dispatch
       */
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapActions', namespace)
        if (!module) {
          return
        }
        dispatch = module.context.dispatch
      }
      /**
       * 此时的 this 指向的当前单文件的 vm 实例对象
       * 如果 val 是函数, dispatch 函数作为 val 的第一个参数
       *
       * val 如果不是函数, 则为 dispatch 对应的 key
       * 调用自身模块下的 dispatch
       * ...mapActions({
       *   clickHandle: function (dispatch) {
       *     dispatch('getName')
       *   }
       * }),
       */
      return typeof val === 'function'
        ? val.apply(this, [dispatch].concat(args))
        : dispatch.apply(this.$store, [val].concat(args))
    }
  })
  return res
})

/**
 * Rebinding namespace param for mapXXX function in special scoped, and return them by simple object
 * @param {String} namespace
 * @return {Object}
 * 在特殊范围内, 为mapXXX 重新绑定命名空间参数,并通过简单对象返回它们
 * 函数颗粒化
 * 一个函数接受两个参数, 这两个参数的传递通过调用两次函数, 将参数单个传递
 */
export const createNamespacedHelpers = (namespace) => ({
  mapState: mapState.bind(null, namespace),
  mapGetters: mapGetters.bind(null, namespace),
  mapMutations: mapMutations.bind(null, namespace),
  mapActions: mapActions.bind(null, namespace)
})

/**
 * 归一化map
 * 此时的 map结构可能是
 *  - {key - val}
 *  - {key - function}
 *  - [key, key, key]
 * Normalize the map
 * normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
 * normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
 * @param {Array|Object} map
 * @return {Object}
 */
function normalizeMap (map) {
  if (!isValidMap(map)) {
    return []
  }
  return Array.isArray(map)
    ? map.map(key => ({ key, val: key }))
    : Object.keys(map).map(key => ({ key, val: map[key] }))
}

/**
 * Validate whether given map is valid or not
 * @param {*} map
 * @return {Boolean}
 */
function isValidMap (map) {
  return Array.isArray(map) || isObject(map)
}

/**
 * Return a function expect two param contains namespace and map. it will normalize the namespace and then the param's function will handle the new namespace and the map.
 * @param {Function} fn
 * @return {Function}
 * 标准化命名空间
 * 期望两个参数, 包含m命名空间和映射
 */
function normalizeNamespace (fn) {
  /**
   * computed: {
   *   ...mapState('user', {
   *     xxx: xxx
   *   })
   * }
   */
  return (namespace, map) => {
    if (typeof namespace !== 'string') {
      map = namespace
      namespace = ''
    } else if (namespace.charAt(namespace.length - 1) !== '/') {
      // 如果使用命名空间, user, 默认给 user 追加 / => user/
      namespace += '/'
    }
    return fn(namespace, map)
  }
}

/**
 * Search a special module from store by namespace. if module not exist, print error message.
 * @param {Object} store
 * @param {String} helper
 * @param {String} namespace
 * @return {Object}
 *
 * 如果你要使用命名空间, 必须要创建命名空间模块, 这样 vuex 会在初始化时给进行注册
 * 如果使用命名空间, 且命名空间没有注册, 则抛出警告
 */
function getModuleByNamespace (store, helper, namespace) {
  const module = store._modulesNamespaceMap[namespace]
  if (__DEV__ && !module) {
    console.error(`[vuex] module namespace not found in ${helper}(): ${namespace}`)
  }
  return module
}
