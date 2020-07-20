/**
 * Created by qiqf on 2020/5/17
 */
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const moduleA = {
  state: () => ({
    moduleName: 'A'
  }),
  mutations: { },
  actions: { },
  getters: { },
  modules: {
    family: {
      state: {}
    }
  }
}

const moduleB = {
  state: () => ({
    moduleName: 'B'
  }),
  mutations: { },
  actions: { }
}

const store = new Vuex.Store({
  modules: {
    a: moduleA,
    b: moduleB
  }
})

export default store
