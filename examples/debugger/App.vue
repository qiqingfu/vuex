<template>
  <div>
    <button @click="clickHandle">获取名字</button>
    <button @click="add">增加一岁</button>
    hello, 我的名字是 {{ name }}, 我今年[user]下的 age {{ userAge }}
    <div>
      我今年 [root] 模块下的 age {{ rootAge }}
    </div>
    <ul>
      <li v-for="(item, index) in links" :key="index">{{ item }}</li>
    </ul>
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex'
export default {
  name: 'App',
  computed: {
    ...mapState({
      'name': 'name',
      'rootAge': 'age'
    }),
    ...mapState('user/', {
      'userAge': 'age'
    }),
    links () {
      return this.$store.getters['user/reverseLinks']
    }
  },
  methods: {
    ...mapActions({
      clickHandle: function (dispatch) {
        dispatch('getName')
      }
    }),
    ...mapActions('user/', {
      add: 'setAge'
    })
  },
  mounted () {
    console.log(this.$store)
  }
}
</script>

<style scoped>

</style>
