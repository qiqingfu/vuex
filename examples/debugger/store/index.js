/**
 * Created by qiqf on 2020/5/17
 */
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const cart = {
  namespaced: true,
  state: {
    count: 1
  }
}

const user = {
  namespaced: true,
  state: {
    userInfo: {}
  }
}

export default new Vuex.Store({
  state () {
    return {
      name: 'qiqf'
    }
  },
  mutations: {
    plus () {}
  },
  actions: {
    add (store) {
      console.log('add')
    }
  },
  getters: {
    count (state) {
      console.log('getters count')
    }
  },
  modules: {
    cart,
    user
  }
})
