/**
 * Created by qiqf on 2020/5/17
 */
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    name: 'zhangsan'
  },
  actions: {
    add: {
      handler () {
        console.log('actions add')
      }
    }
  }
})
