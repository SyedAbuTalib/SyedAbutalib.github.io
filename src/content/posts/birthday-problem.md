---
title: "The birthday problem, in code"
description: "There's a 50/50 chance two people in a room of 23 share a birthday. Walking through why, with Ruby and a little algebra."
pubDatetime: 2026-09-11T00:00:00Z
tags:
  - ruby
  - probability
---

You probably already know the problem.
There's a 50/50 chance of two people having the same birthday in a 365-day calendar year.
How?

Intuitively, humans think in addition, subtraction, multiplication, division.
But the math involved in the birthday problem involves exponents, and boy do we suck at exponents.

Let's look at the code.

## Ruby Code

```ruby
def play(people)
  enumerated_birthdays = Hash.new(0)

  people.times do
    enumerated_birthdays[rand(365)] += 1
  end

  enumerated_birthdays.each do |_key, val|
    return true if val > 1
  end
  false
end
```

Hmm... still no exponents. We're getting there trust me.
But in this code from `birthday_problem.rb`, we can see how we determine a birthday being shared or not.

## Simulation

When running `ruby birthday_problem.rb`, a 1000 test cases will run and a hash will be printed. In a run, I got:

```text
{"passes"=>502, "fails"=>498}
```

As we can see, we got pretty close to getting 50/50. But how?

## Explanation

Let's think about this problem in handshakes.
When there are 23 people (including ourselves), we shake hands with 22 other people.
But we don't need to be part of the two people who share a birthday.
We need to account that other people shake hands with each other,
so the total amount of handshakes is actually:

$$
\binom{23}{2} = \frac{23 \times 22}{2} = 253
$$

And in each handshake, there is a 1/365 chance of the two people sharing birthdays.
We can use this information and use the "At least 1" rule:
The chances of having "At least 1" is the same probability of 1 - None

$$
1 - \left(\frac{364}{365}\right)^{253} \approx 0.5005
$$

We barely have over a 50% chance of two people sharing a birthday when it comes to 23 people.

---

The full source, including a refactored version, lives at
[github.com/SyedAbuTalib/birthday_problem](https://github.com/SyedAbuTalib/birthday_problem).
