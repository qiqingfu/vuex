/**
 * Created by qiqf on 2020/5/17
 */
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const moduleA = {
  namespaced: true,
  state: {
    moduleName: 'a'
  }
}

const moduleB = {
  namespaced: true,
  state: {
    moduleName: 'b'
  }
}

export default new Vuex.Store({
  state () {
    return {
      name: 'qiqf'
    }
  },
  actions: {
    add: {
      handler () {
        console.log('actions add')
      }
    }
  },
  modules: {
    moduleA,
    moduleB
  }
})
