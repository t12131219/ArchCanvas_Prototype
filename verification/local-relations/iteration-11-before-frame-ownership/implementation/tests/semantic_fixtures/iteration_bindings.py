"""Normal-completion bindings and adversarial control/effect boundaries."""
import torch


def accumulate(x, side, steps):
    value = x
    for index in range(steps):
        value = torch.tanh(value + side)
    return value


def conditional(x, side, steps, flag):
    value = x
    for index in range(steps):
        if flag:
            value = torch.tanh(value + side)
    return value


def coupled(x, y, steps):
    first, second = x, y
    for index in range(steps):
        first, second = second, first
    return first, second


def guarded(x, side, limit):
    value, position = x, 0
    while position < limit:
        value = torch.tanh(value + side)
        position = position + 1
    return value, position


def early(x, side, steps, flag):
    value = x
    for index in range(steps):
        if flag:
            break
        value = torch.tanh(value + side)
    return value


def unknown(x, side, steps):
    value = x
    for index in range(steps):
        value = unknown_step(value, side)
    return value


def mutable(x, side, steps):
    value = x
    for index in range(steps):
        value.add_(side)
        value = torch.tanh(value)
    return value


def temporary(x, side, steps):
    value = x
    for index in range(steps):
        projected = torch.tanh(value)
        value = projected + side
    return value, projected


def unbound(x, steps):
    value = x
    for index in range(steps):
        value = value + previous
        previous = value
    return value


def item_input(x, items):
    value = x
    for item in items:
        value = torch.tanh(value + item)
    return value
