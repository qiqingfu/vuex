<template>
  <div>
    hello, {{ name }}
  </div>
</template>

<script>
export default {
  name: 'App',
  computed: {
    name() {
      return this.$store.state.name;
    }
  }
}
</script>

<style scoped>

</style>
