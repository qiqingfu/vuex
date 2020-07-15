<template>
  <div>
    Hello, Vuex Module
  </div>
</template>

<script>
export default {
  name: 'App',
  computed: {
  },
  mounted () {
    console.log(this.$store)
  }
}
</script>

<style scoped>

</style>
