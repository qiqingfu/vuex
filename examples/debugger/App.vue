<template>
  <div>
    <button @click="clickHandle">获取名字</button>
    <button @click="add">增加一岁</button>
    hello, 我的名字是 {{ userName }}, 我今年[user]下的 age {{ age }}
    <div>
      我今年 [root] 模块下的 age {{ $store.state.age }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'App',
  computed: {
    userName () {
      return this.$store.state.name
    },
    age () {
      return this.$store.state.user.age
    }
  },
  methods: {
    clickHandle () {
      this.$store.dispatch('getName')
    },
    add () {
      this.$store.dispatch(`user/setAge`)
    }
  },
  mounted () {
    console.log(this.$store)
  }
}
</script>

<style scoped>

</style>
