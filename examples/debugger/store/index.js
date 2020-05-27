/**
 * Created by qiqf on 2020/5/17
 */
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const user = {
  namespaced: true,
  state: {
    age: 22,
    sex: '男',
    links: ['写代码', '读书', '看电影']
  },
  mutations: {
    ageAdd (state, payload) {
      state.age = state.age + payload
    }
  },
  actions: {
    setAge ({ commit }, payload) {
      commit('ageAdd', 1, { root: true })
    }
  }
}

export default new Vuex.Store({
  state () {
    return {
      name: '',
      age: 0
    }
  },
  mutations: {
    setName (state, payload) {
      state.name = payload
    },
    ageAdd (state, payload) {
      state.age = state.age + payload
    }
  },
  actions: {
    getName ({ commit }, payload) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          commit('setName', 'qiYANG')
          resolve()
        }, 2000)
      })
    }
  },
  modules: {
    user
  }
})
