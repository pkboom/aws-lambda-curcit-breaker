import CircuitBreaker from './CircuitBreaker.js'

let asdf = new CircuitBreaker({}, { failureThreshold: 3, timeout: 1000 })

console.log(asdf)
