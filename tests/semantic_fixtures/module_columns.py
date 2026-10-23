"""Ordinary source modules with unequal internal widths; no attention semantics."""
import torch
from torch import nn


class WideProducer(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = nn.Linear(4, 4)
        self.right = nn.Linear(4, 4)

    def forward(self, x):
        return self.left(x) + self.right(x)


class NarrowConsumer(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(4, 4)

    def forward(self, x):
        return torch.relu(self.project(x))


class SerialModules(nn.Module):
    def __init__(self):
        super().__init__()
        self.produce = WideProducer()
        self.consume = NarrowConsumer()

    def forward(self, x):
        return self.consume(self.produce(x))


class ParallelModules(nn.Module):
    def __init__(self):
        super().__init__()
        self.produce = WideProducer()
        self.consume = NarrowConsumer()

    def forward(self, x):
        return self.produce(x) + self.consume(x)
