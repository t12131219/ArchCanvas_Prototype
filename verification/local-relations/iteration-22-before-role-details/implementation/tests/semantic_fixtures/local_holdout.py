"""Compositions introduced after the generic boundary implementation freeze.

Analyze statically. Undefined calls are intentional unknown boundaries.
"""
import torch
from torch import nn


class ConditionalCarry(nn.Module):
    def __init__(self):
        super().__init__()
        self.p = nn.Linear(8, 8)
        self.q = nn.Linear(8, 8)
        self.state = nn.RNN(8, 8, batch_first=True)
        self.left = nn.Linear(8, 8)
        self.right = nn.Linear(8, 8)

    def forward(self, x, side, initial, flag):
        a = self.p(x)
        b = self.q(side)
        carry = torch.tanh(a + b)
        sequence, final = self.state(carry, initial)
        if flag:
            local = self.left(sequence)
        else:
            local = self.right(sequence)
        gated = torch.sigmoid(b) * local
        result = unknown_kernel(gated, final)
        return result, carry, final


class SharedMismatch(nn.Module):
    def __init__(self):
        super().__init__()
        self.shared = nn.Linear(8, 8)
        self.recurrent = nn.GRU(8, 8, batch_first=True)
        self.finish = nn.Linear(8, 8)

    def forward(self, x, side, initial, flag):
        first = self.shared(x)
        second = self.shared(side)
        values, indices = torch.topk(torch.softmax(first, dim=-1), 2, dim=-1)
        hidden_input = unknown_state(initial)
        sequence, final = self.recurrent(second, hidden_input)
        if flag:
            mixed = self.finish(sequence)
        else:
            mixed = sequence + second
        return mixed * values, indices, final


class EarlyBoundary(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)

    def forward(self, x, side, steps, stop):
        value = self.project(x)
        for position in range(steps):
            if stop:
                break
            value = unknown_step(value, side)
        return torch.sigmoid(value) * side, value
