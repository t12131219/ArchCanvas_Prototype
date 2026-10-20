"""Original composition fixtures. Analysis must not import or execute this file.

These are deliberately not named after model families. Names must not be used
to choose semantic roles, a complete-cell template, or fixed coordinates.
"""
import torch
from torch import nn


class ForkUnit(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)
        self.b = nn.Linear(8, 8)
        self.c = nn.Linear(8, 8)
        self.out = nn.Linear(8, 8)
        self.norm = nn.LayerNorm(8)

    def forward(self, x):
        q = self.a(x)
        k = self.b(x)
        v = self.c(x)
        scores = torch.matmul(q, k.transpose(-2, -1)) / 2.0
        probabilities = torch.softmax(scores, dim=-1)
        mixed = torch.matmul(probabilities, v)
        return self.norm(x + self.out(mixed))


class BrokenCell(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)
        self.b = nn.Linear(8, 8)

    def forward(self, x, state):
        # Deliberately not a complete LSTM cell; there is no cell-state update.
        gate = torch.sigmoid(self.a(x))
        value = torch.tanh(self.b(state))
        return gate * value


class RoutedUnit(nn.Module):
    def __init__(self):
        super().__init__()
        self.router = nn.Linear(8, 2)
        self.a = nn.Linear(8, 8)
        self.b = nn.Linear(8, 8)

    def forward(self, x):
        weights = torch.softmax(self.router(x), dim=-1)
        selected, indices = torch.topk(weights, 1, dim=-1)
        # Explicit top-1 routing. Both source paths remain; a CPU run observes
        # only the path taken by its concrete inputs and parameter generation.
        if indices.sum() > 0:
            y = self.b(x)
        else:
            y = self.a(x)
        return y * selected


class ForeignComposition(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = ForkUnit()
        self.piece = BrokenCell()
        self.sequence = nn.RNN(8, 8, batch_first=True)
        self.route = RoutedUnit()
        self.finish = nn.Linear(8, 8)

    def forward(self, x, state):
        attended = self.first(x)
        gated = self.piece(attended, state)
        sequence, hidden = self.sequence(gated)
        routed = self.route(sequence)
        return self.finish(routed) + attended, hidden


class BeforeNorm(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm = nn.LayerNorm(8)
        self.a = nn.Linear(8, 16)
        self.b = nn.Linear(16, 8)

    def forward(self, x):
        return x + self.b(torch.relu(self.a(self.norm(x))))


class DisconnectedNorm(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm = nn.LayerNorm(8)
        self.a = nn.Linear(8, 8)

    def forward(self, x, other):
        return self.a(x) + self.norm(other)


class UnknownFusion(nn.Module):
    def __init__(self):
        super().__init__()
        self.part = BrokenCell()

    def forward(self, x, state):
        local = self.part(x, state)
        foreign = unfamiliar_kernel(local, state)
        return x + foreign


class SharedBranches(nn.Module):
    def __init__(self):
        super().__init__()
        self.shared = nn.Linear(8, 8)
        self.alias = self.shared

    def forward(self, x):
        return self.shared(x) + self.alias(x)


class LoopWithBoundary(nn.Module):
    def __init__(self):
        super().__init__()
        self.step = BrokenCell()

    def forward(self, x, state, count):
        for i in range(count):
            state = self.step(x, state)
        return state


class RepeatedFragments(nn.Module):
    def __init__(self):
        super().__init__()
        self.one = BrokenCell()
        self.two = BrokenCell()
        self.three = BrokenCell()

    def forward(self, x, state):
        a = self.one(x, state)
        b = self.two(a, state)
        return self.three(b, state)
