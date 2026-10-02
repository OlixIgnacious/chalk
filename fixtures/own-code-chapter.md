# Averaging Without Hiding the Spread

*Original teaching text written for chalk's tests. Not from any book.*

The mean of a list of numbers is their sum divided by how many there are. It is a single number
standing in for the whole list, and that is both its use and its danger.

Two lists can share a mean and still behave very differently. The variance measures how far the
values sit from the mean, on average, and so tells the two lists apart.

```python
def mean(xs):
    return sum(xs) / len(xs)

def variance(xs):
    m = mean(xs)
    return sum((x - m) ** 2 for x in xs) / len(xs)
```

The function above computes the population variance. Dividing by one fewer than the count gives the
sample variance instead, which is the usual choice when the list is only a sample.

```javascript
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
```

Exercise 1. Write a function that returns the standard deviation of a list, using the variance
function above.
