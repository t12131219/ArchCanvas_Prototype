"""Original acceptance sources; analyze statically, never import this file.

The same arithmetic is composed with boundaries and incomplete relationships.
Names, family labels and source hashes must never select inference rules.
"""
import torch
from torch import nn


class LocalPiece(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)
        self.b = nn.Linear(8, 8)

    def forward(self, x, side):
        gate = torch.sigmoid(self.a(x))
        signal = torch.tanh(self.b(side))
        return gate * signal


class MixedCircuit(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)
        self.b = nn.Linear(8, 8)
        self.c = nn.Linear(8, 8)
        self.finish = nn.Linear(8, 8)
        self.piece = LocalPiece()
        self.sequence = nn.RNN(8, 8, batch_first=True)
        self.left = nn.Linear(8, 8)
        self.right = nn.Linear(8, 8)

    def forward(self, x, side, initial, flag):
        a, b, c = self.a(x), self.b(x), self.c(side)
        scores = torch.matmul(a, b.transpose(-2, -1)) / 2.0
        weights = torch.softmax(scores, dim=-1)
        mixed = self.finish(torch.matmul(weights, c))
        gated = self.piece(mixed, side)
        sequence, final = self.sequence(gated, initial)
        if flag:
            selected = self.left(sequence)
        else:
            selected = self.right(sequence)
        foreign = unknown_kernel(selected, side)
        return foreign + mixed, final, gated


class SplitCircuit(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)
        self.b = nn.Linear(8, 8)
        self.finish = nn.Linear(8, 8)

    def forward(self, x, side):
        a, b = self.a(x), self.b(side)
        shaped = a.reshape(2, 4).transpose(0, 1)
        foreign = unknown_kernel(shaped)
        weights = torch.softmax(foreign, dim=-1)
        return self.finish(weights), b


class ChosenCircuit(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)
        self.b = nn.Linear(8, 8)

    def forward(self, x, side, flag):
        weights, indices = torch.topk(torch.softmax(x, dim=-1), 1, dim=-1)
        if flag:
            result = self.a(side)
        else:
            result = self.b(side)
        # Selection exists, but it does not control the conditional calls.
        return result * weights, indices
